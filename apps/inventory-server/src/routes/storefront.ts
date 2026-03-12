/**
 * Storefront public API
 *
 * GET  /api/storefront/settings               — public
 * PATCH /api/storefront/settings              — tenant_admin
 *
 * GET  /api/storefront/products               — public, filterable
 * GET  /api/storefront/products/:id           — public
 *
 * POST /api/storefront/checkout               — public (creates Stripe session)
 * GET  /api/storefront/orders/:orderNumber    — public (customer order lookup)
 *
 * POST /api/storefront/analytics              — fire-and-forget
 */

import { Router } from 'express';
import { z }      from 'zod';
import Stripe     from 'stripe';
import { withTenantSchema, getPool } from '@gadnuc/db';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { sendOrderConfirmation }    from '../services/nodemailer.js';
import { emitWebhookEvent }         from '../services/webhooks.js';
import { stripeCheckoutSessions }   from '../metrics.js';
import type { Request, Response }  from 'express';

const PLATFORM_FEE_PCT = Number(process.env.PLATFORM_FEE_PCT ?? 5);

export const storefrontRouter = Router();

// ── Stripe client (lazy-initialised) ──────────────────────────────────────────
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

// ── GET /api/storefront/settings ─────────────────────────────────────────────
storefrontRouter.get('/settings', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query('SELECT * FROM storefront_settings LIMIT 1');
      return rows[0] ?? null;
    });
    res.json({ data: row ?? {} });
  } catch (err) {
    console.error('[storefront] GET settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/storefront/settings ───────────────────────────────────────────
const patchSettingsSchema = z.object({
  store_name:    z.string().min(1).max(100).optional(),
  tagline:       z.string().max(255).optional(),
  theme:         z.enum(['default', 'dark', 'minimal', 'bold']).optional(),
  logo_url:      z.string().url().optional(),
  hero_title:    z.string().max(200).optional(),
  hero_subtitle: z.string().max(500).optional(),
  hero_image_url: z.string().url().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent_color:  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().max(30).optional(),
  social_links:  z.record(z.string()).optional(),
  seo_title:     z.string().max(70).optional(),
  seo_description: z.string().max(160).optional(),
  custom_css:    z.string().optional(),
}).strict();

storefrontRouter.patch(
  '/settings',
  requireAuth,
  requireRole('tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant = req.tenant;
    if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

    const parsed = patchSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
      return;
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      res.status(422).json({ error: 'No fields to update' });
      return;
    }

    const keys      = Object.keys(updates) as (keyof typeof updates)[];
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const values     = keys.map((k) => updates[k]);
    const sql = `
      INSERT INTO storefront_settings (${keys.map((k) => `"${k}"`).join(', ')})
      VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT ((true))
      DO UPDATE SET ${setClauses}, updated_at = now()
      RETURNING *
    `;

    try {
      const row = await withTenantSchema(tenant.slug, async (db) => {
        const { rows } = await db.query(sql, values);
        return rows[0];
      });
      res.json({ data: row });
    } catch (err) {
      console.error('[storefront] PATCH settings error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── GET /api/storefront/products ─────────────────────────────────────────────
storefrontRouter.get('/products', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const { category, search, page = '1', limit = '24' } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const { rows, total } = await withTenantSchema(tenant.slug, async (db) => {
      const conditions: string[] = ['is_active = true'];
      const params: unknown[] = [];

      if (category) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(
          `(lower(name) LIKE $${params.length} OR lower(description) LIKE $${params.length})`,
        );
      }

      const where = conditions.join(' AND ');

      // Count query
      const { rows: countRows } = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE ${where}`,
        params,
      );
      const total = countRows[0]?.cnt ?? 0;

      // Data query
      params.push(limitNum, offset);
      const { rows } = await db.query(
        `SELECT id, sku, name, description, category, price_cents, stock_qty, image_url, metadata
         FROM products
         WHERE ${where}
         ORDER BY name ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return { rows, total };
    });

    res.json({
      data: rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[storefront] GET products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/storefront/products/:id ─────────────────────────────────────────
storefrontRouter.get('/products/:id', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT id, sku, name, description, category, price_cents, stock_qty,
                low_stock_threshold, image_url, metadata
         FROM products
         WHERE id = $1 AND is_active = true`,
        [req.params.id],
      );
      return rows[0] ?? null;
    });

    if (!row) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json({ data: row });
  } catch (err) {
    console.error('[storefront] GET product/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/storefront/categories ───────────────────────────────────────────
storefrontRouter.get('/categories', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const rows = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT DISTINCT category FROM products WHERE is_active = true AND category IS NOT NULL ORDER BY category`,
      );
      return rows.map((r: Record<string, unknown>) => r.category as string);
    });
    res.json({ data: rows });
  } catch (err) {
    console.error('[storefront] GET categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/checkout ─────────────────────────────────────────────
const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity:  z.number().int().min(1).max(1000),
  })).min(1).max(50),
  successUrl:    z.string().url(),
  cancelUrl:     z.string().url(),
  customerEmail: z.string().email().optional(),
});

storefrontRouter.post('/checkout', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  const { items, successUrl, cancelUrl, customerEmail } = parsed.data;

  type ProdRow = { id: string; name: string; price_cents: number; stock_qty: number; image_url: string | null; is_active: boolean };

  try {
    // 1. Fetch product details from DB to get authoritative prices
    const productIds = items.map((i) => i.productId);
    const products: ProdRow[] = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT id, name, price_cents, stock_qty, image_url, is_active
         FROM products WHERE id = ANY($1::uuid[])`,
        [productIds],
      );
      return rows as ProdRow[];
    });

    // Validate all products exist, are active, and have sufficient stock
    const productMap = new Map<string, ProdRow>(products.map((p) => [p.id, p]));
    for (const item of items) {
      const p = productMap.get(item.productId);
      if (!p)              { res.status(422).json({ error: `Product ${item.productId} not found` }); return; }
      if (!p.is_active)    { res.status(422).json({ error: `Product "${p.name}" is unavailable` }); return; }
      if (p.stock_qty < item.quantity) {
        res.status(422).json({ error: `Insufficient stock for "${p.name}"` });
        return;
      }
    }

    // 2. Look up Stripe Connect status for this tenant
    const pool = getPool();
    const { rows: [tenantRow] } = await pool.query<{
      stripe_connect_account_id: string | null;
      stripe_connect_enabled:    boolean;
    }>(
      `SELECT stripe_connect_account_id, stripe_connect_enabled
       FROM public.tenants WHERE slug = $1`,
      [tenant.slug],
    );
    const connectAccountId =
      tenantRow?.stripe_connect_enabled && tenantRow?.stripe_connect_account_id
        ? tenantRow.stripe_connect_account_id
        : null;

    // Pre-compute total for platform fee (only when Connect is active)
    const totalCents = items.reduce((sum, item) => {
      const p = productMap.get(item.productId)!;
      return sum + p.price_cents * item.quantity;
    }, 0);

    // 3. Build Stripe line items
    const stripe = getStripe();
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => {
      const p = productMap.get(item.productId)!;
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: p.name,
            ...(p.image_url ? { images: [p.image_url] } : {}),
          },
          unit_amount: p.price_cents,
        },
        quantity: item.quantity,
      };
    });

    // 4. Create Stripe Checkout Session (with Connect if enabled)
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode:        'payment',
      line_items:  lineItems,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      metadata: {
        tenant_slug: tenant.slug,
        items_json:  JSON.stringify(items),
      },
      payment_intent_data: {
        metadata: { tenant_slug: tenant.slug },
        ...(connectAccountId ? {
          application_fee_amount: Math.round(totalCents * PLATFORM_FEE_PCT / 100),
          transfer_data:          { destination: connectAccountId },
        } : {}),
      },
    };

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      connectAccountId ? { stripeAccount: connectAccountId } : undefined,
    );

    stripeCheckoutSessions.inc({
      tenant_slug: tenant.slug,
      mode:        connectAccountId ? 'connect' : 'direct',
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[storefront] POST checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/storefront/checkout/webhook ────────────────────────────────────
// NOTE: This handler requires raw body — it is registered in app.ts
// BEFORE express.json(), using express.raw({ type: 'application/json' }).
export async function handleStripeWebhook(req: Request, res: Response) {
  const sig       = req.headers['stripe-signature'] as string;
  const secret    = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set');
    res.status(500).end();
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    res.json({ received: true });
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const tenantSlug = session.metadata?.tenant_slug;
  const itemsJson  = session.metadata?.items_json;

  if (!tenantSlug || !itemsJson) {
    console.error('[webhook] Missing metadata on session', session.id);
    res.json({ received: true });
    return;
  }

  try {
    const items: Array<{ productId: string; quantity: number }> = JSON.parse(itemsJson);

    // Fetch authoritative product data & build order — wrapped in a transaction
    // so stock decrements and order creation are atomic (idempotent on replay).
    await withTenantSchema(tenantSlug, async (db) => {
      await db.query('BEGIN');
      try {
      const productIds = items.map((i) => i.productId);
      const { rows: products } = await db.query(
        'SELECT id, name, price_cents, sku FROM products WHERE id = ANY($1::uuid[])',
        [productIds],
      );
      const productMap = new Map(
        (products as Array<{ id: string; name: string; price_cents: number; sku: string }>)
          .map((p) => [p.id, p]),
      );

      const totalCents = items.reduce((sum, item) => {
        return sum + (productMap.get(item.productId)?.price_cents ?? 0) * item.quantity;
      }, 0);

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // Create order
      const { rows: orderRows } = await db.query(
        `INSERT INTO orders
           (order_number, customer_name, customer_email, status,
            total_cents, stripe_payment_intent_id, stripe_session_id)
         VALUES ($1, $2, $3, 'processing', $4, $5, $6)
         RETURNING id, order_number`,
        [
          orderNumber,
          session.customer_details?.name ?? 'Customer',
          session.customer_details?.email ?? null,
          totalCents,
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
          session.id,
        ],
      );
      const orderId = orderRows[0].id as string;

      // Create order items
      for (const item of items) {
        const p = productMap.get(item.productId);
        if (!p) continue;
        await db.query(
          `INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, p.sku, p.name, item.quantity, p.price_cents],
        );
        // Decrement stock
        await db.query(
          'UPDATE products SET stock_qty = GREATEST(0, stock_qty - $1), updated_at = now() WHERE id = $2',
          [item.quantity, item.productId],
        );
      }

      await db.query('COMMIT');

      // Fire-and-forget confirmation email (outside transaction)
      const email = session.customer_details?.email;
      if (email) {
        sendOrderConfirmation({
          to:          email,
          orderNumber,
          totalCents,
          items:       items.map((item) => ({
            name:           productMap.get(item.productId)?.name ?? 'Unknown',
            quantity:       item.quantity,
            unitPriceCents: productMap.get(item.productId)?.price_cents ?? 0,
          })),
          tenantSlug,
        }).catch((err) => console.error('[webhook] Email send failed:', err));
      }

      // Fire-and-forget webhook for storefront order
      getPool().query('SELECT id FROM public.tenants WHERE slug = $1', [tenantSlug])
        .then(({ rows }) => {
          if (rows[0]) {
            emitWebhookEvent(rows[0].id as string, 'order.created', {
              order_number: orderNumber,
              total_cents: totalCents,
              source: 'storefront',
            });
          }
        })
        .catch((err: unknown) => console.error('[webhook] Storefront order webhook failed:', err));

      return orderRows[0];
      } catch (txErr) {
        await db.query('ROLLBACK').catch(() => {/* ignore rollback error */});
        throw txErr;
      }
    });

    res.json({ received: true });
  } catch (err) {
    console.error('[webhook] Order creation failed:', err);
    // Return 200 so Stripe doesn't retry for non-transient errors
    res.json({ received: true, error: 'Order creation failed' });
  }
}

// ── GET /api/storefront/orders/:orderNumber ──────────────────────────────────
storefrontRouter.get('/orders/:orderNumber', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const result = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: orderRows } = await db.query(
        `SELECT id, order_number, customer_name, customer_email, status,
                total_cents, shipping_address, created_at, updated_at
         FROM orders
         WHERE order_number = $1`,
        [req.params.orderNumber],
      );
      if (!orderRows[0]) return null;

      const order = orderRows[0];
      const { rows: itemRows } = await db.query(
        `SELECT oi.sku, oi.name, oi.quantity, oi.unit_price_cents,
                p.image_url, p.id AS product_id
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [(order as Record<string, unknown>).id],
      );
      return { ...order, items: itemRows };
    });

    if (!result) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json({ data: result });
  } catch (err) {
    console.error('[storefront] GET orders/:orderNumber error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/analytics ───────────────────────────────────────────
const analyticsSchema = z.object({
  eventType: z.enum(['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'order_complete']),
  pagePath:  z.string().max(500).optional(),
  productId: z.string().uuid().optional(),
  sessionId: z.string().max(128).optional(),
  referrer:  z.string().max(500).optional(),
  metadata:  z.record(z.unknown()).optional(),
});

storefrontRouter.post('/analytics', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(204).end(); return; }

  const parsed = analyticsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(204).end(); return; }

  // Respond immediately — fire and forget
  res.status(204).end();

  const { eventType, pagePath, productId, sessionId, referrer, metadata } = parsed.data;
  const userAgent = req.headers['user-agent']?.slice(0, 255) ?? null;
  const ip        = (req.headers['x-forwarded-for'] as string ?? req.socket.remoteAddress ?? '');

  // Privacy-safe IP hash (SHA-256)
  const crypto = await import('node:crypto');
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  withTenantSchema(tenant.slug, async (db) => {
    await db.query(
      `INSERT INTO storefront_analytics
         (event_type, page_path, product_id, session_id, user_agent, ip_hash, referrer, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        eventType, pagePath ?? null, productId ?? null, sessionId ?? null,
        userAgent, ipHash, referrer ?? null, JSON.stringify(metadata ?? {}),
      ],
    );
  }).catch((err: unknown) => console.error('[analytics] Insert failed:', err));
});
