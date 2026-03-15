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
 *
 * GET  /api/storefront/products/:id/reviews   — public (approved reviews)
 * POST /api/storefront/products/:id/reviews   — authenticated customer
 */

import { Router } from 'express';
import { z }      from 'zod';
import Stripe     from 'stripe';
import { withTenantSchema, getPool } from '@gadnuc/db';
import { requireAuth, optionalAuth, requireRole } from '@gadnuc/auth';
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
  store_name:       z.string().min(1).max(100).optional(),
  tagline:          z.string().max(255).optional(),
  theme:            z.enum(['default', 'dark', 'minimal', 'bold', 'clean']).optional(),
  logo_url:         z.string().url().optional(),
  hero_title:       z.string().max(200).optional(),
  hero_subtitle:    z.string().max(500).optional(),
  hero_image_url:   z.string().url().optional(),
  hero_enabled:     z.boolean().optional(),
  primary_color:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent_color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  nav_bg_color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  nav_text_color:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  footer_bg_color:  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  footer_text_color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  contact_email:    z.string().email().optional(),
  contact_phone:    z.string().max(30).optional(),
  social_links:     z.record(z.string()).optional(),
  seo_title:        z.string().max(70).optional(),
  seo_description:  z.string().max(160).optional(),
  custom_css:       z.string().optional(),
  custom_homepage_enabled: z.boolean().optional(),
  custom_homepage_url:     z.string().url().optional().or(z.literal('')),
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
storefrontRouter.get('/products', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const isWholesale = req.user?.isWholesale === true;
  const {
    category, search, page = '1', limit = '24', sort = 'name_asc',
    min_price, max_price, brand, in_stock, on_sale, min_rating,
  } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const offset   = (pageNum - 1) * limitNum;

  const SORT_MAP: Record<string, string> = {
    name_asc:   'name ASC',
    name_desc:  'name DESC',
    price_asc:  'price_cents ASC',
    price_desc: 'price_cents DESC',
    newest:     'created_at DESC',
  };
  const orderBy = SORT_MAP[sort] ?? 'name ASC';

  try {
    const { rows, total } = await withTenantSchema(tenant.slug, async (db) => {
      const conditions: string[] = ['is_active = true'];
      const params: unknown[] = [];

      // Wholesale customers see everything; retail customers cannot see wholesale-only products
      if (!isWholesale) {
        conditions.push('wholesale_only = false');
      }

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
      if (min_price) {
        params.push(parseInt(min_price, 10));
        conditions.push(`price_cents >= $${params.length}`);
      }
      if (max_price) {
        params.push(parseInt(max_price, 10));
        conditions.push(`price_cents <= $${params.length}`);
      }
      if (brand) {
        params.push(brand);
        conditions.push(`brand = $${params.length}`);
      }
      if (in_stock === 'true') {
        conditions.push('stock_qty > 0');
      }
      if (on_sale === 'true') {
        conditions.push(`sale_price_cents IS NOT NULL
          AND (sale_start IS NULL OR sale_start <= now())
          AND (sale_end IS NULL OR sale_end >= now())`);
      }
      if (min_rating) {
        params.push(parseFloat(min_rating));
        conditions.push(`avg_rating >= $${params.length}`);
      }

      const where = conditions.join(' AND ');

      // Count query
      const { rows: countRows } = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE ${where}`,
        params,
      );
      const total = countRows[0]?.cnt ?? 0;

      // Data query — sale_price_cents is only returned when the sale window is active
      // effective_price_cents: wholesale customers get wholesale price (if set), else retail
      params.push(isWholesale, limitNum, offset);
      const wholesaleIdx = params.length - 2;
      const { rows } = await db.query(
        `SELECT id, sku, name, description, category, price_cents,
                CASE
                  WHEN sale_price_cents IS NOT NULL
                   AND (sale_start IS NULL OR sale_start <= now())
                   AND (sale_end   IS NULL OR sale_end   >= now())
                  THEN sale_price_cents
                  ELSE NULL
                END AS sale_price_cents,
                stock_qty, image_url, metadata, weight_oz, length_in, width_in,
                height_in, shipping_class, tags, brand, is_featured,
                sale_start, sale_end, wholesale_price_cents, wholesale_only, product_type,
                review_count, avg_rating,
                CASE
                  WHEN $${wholesaleIdx}::boolean AND wholesale_price_cents IS NOT NULL
                  THEN wholesale_price_cents
                  ELSE price_cents
                END AS effective_price_cents
         FROM products
         WHERE ${where}
         ORDER BY ${orderBy}
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
storefrontRouter.get('/products/:id', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const isWholesale = req.user?.isWholesale === true;

  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT id, sku, name, description, category, price_cents,
                CASE
                  WHEN sale_price_cents IS NOT NULL
                   AND (sale_start IS NULL OR sale_start <= now())
                   AND (sale_end   IS NULL OR sale_end   >= now())
                  THEN sale_price_cents
                  ELSE NULL
                END AS sale_price_cents,
                stock_qty, low_stock_threshold, image_url, metadata,
                weight_oz, length_in, width_in, height_in, shipping_class,
                tags, brand, is_featured, sale_start, sale_end,
                wholesale_price_cents, wholesale_only, product_type,
                review_count, avg_rating,
                CASE
                  WHEN $2::boolean AND wholesale_price_cents IS NOT NULL
                  THEN wholesale_price_cents
                  ELSE price_cents
                END AS effective_price_cents
         FROM products
         WHERE id = $1 AND is_active = true`,
        [req.params.id, isWholesale],
      );
      return rows[0] ?? null;
    });

    if (!row) { res.status(404).json({ error: 'Product not found' }); return; }

    // Wholesale-only products are hidden from non-wholesale customers
    if ((row as Record<string, unknown>).wholesale_only && !isWholesale) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Include variants for variable products
    let variants: unknown[] = [];
    if ((row as Record<string, unknown>).product_type === 'variable') {
      variants = await withTenantSchema(tenant.slug, async (db) => {
        const { rows: vRows } = await db.query(
          `SELECT id, sku, price_cents, sale_price_cents, stock, weight_oz,
                  attributes, image_url, is_active, position
           FROM product_variants
           WHERE product_id = $1 AND is_active = true
           ORDER BY position ASC, created_at ASC`,
          [req.params.id],
        );
        return vRows;
      });
    }

    // Include product images
    const images = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: imgRows } = await db.query(
        `SELECT id, url, alt_text, position, is_primary, variant_id
         FROM product_images
         WHERE product_id = $1
         ORDER BY position ASC, created_at ASC`,
        [req.params.id],
      );
      return imgRows;
    });

    res.json({ data: { ...row, variants, images } });
  } catch (err) {
    console.error('[storefront] GET product/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/storefront/products/:id/reviews — public approved reviews ───────
storefrontRouter.get('/products/:id/reviews', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const { page = '1', limit = '10' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const result = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT id, customer_name, rating, title, body, created_at, COUNT(*) OVER() AS total_count
         FROM product_reviews
         WHERE product_id = $1 AND status = 'approved'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.params.id, parseInt(limit as string), offset],
      );
      return rows;
    });

    const total = result[0]?.total_count ?? 0;
    res.json({
      data: result.map((r: Record<string, unknown>) => {
        const { total_count, ...rest } = r;
        return rest;
      }),
      meta: { page: parseInt(page as string), limit: parseInt(limit as string), total: parseInt(total as string) },
    });
  } catch (err) {
    console.error('[storefront] GET reviews error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/products/:id/reviews — submit a review ─────────────
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title:  z.string().max(255).optional(),
  body:   z.string().max(5000).optional(),
});

storefrontRouter.post('/products/:id/reviews', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parse = reviewSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { rating, title, body: reviewBody } = parse.data;
  const customerId = req.user?.customerId ?? null;
  const customerName = req.user?.displayName ?? req.body.customer_name ?? 'Anonymous';

  try {
    const review = await withTenantSchema(tenant.slug, async (db) => {
      // Check product exists
      const { rows: [product] } = await db.query(
        'SELECT id FROM products WHERE id = $1 AND is_active = true', [req.params.id],
      );
      if (!product) return null;

      const { rows: [row] } = await db.query(
        `INSERT INTO product_reviews (product_id, customer_id, customer_name, rating, title, body)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, customerId, customerName, rating, title ?? null, reviewBody ?? null],
      );
      return row;
    });

    if (!review) { res.status(404).json({ error: 'Product not found' }); return; }
    res.status(201).json({ data: review });
  } catch (err) {
    console.error('[storefront] POST review error:', err);
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

// ── GET /api/storefront/filters — aggregation data for product filters ───────
storefrontRouter.get('/filters', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const facets = await withTenantSchema(tenant.slug, async (db) => {
      const [
        { rows: catRows },
        { rows: brandRows },
        { rows: priceRows },
      ] = await Promise.all([
        db.query(
          `SELECT category, COUNT(*)::int AS count FROM products
           WHERE is_active = true AND wholesale_only = false AND category IS NOT NULL
           GROUP BY category ORDER BY category`,
        ),
        db.query(
          `SELECT brand, COUNT(*)::int AS count FROM products
           WHERE is_active = true AND wholesale_only = false AND brand IS NOT NULL
           GROUP BY brand ORDER BY brand`,
        ),
        db.query(
          `SELECT MIN(price_cents)::int AS min_price, MAX(price_cents)::int AS max_price
           FROM products WHERE is_active = true AND wholesale_only = false`,
        ),
      ]);

      return {
        categories: catRows,
        brands: brandRows,
        priceRange: { min: priceRows[0]?.min_price ?? 0, max: priceRows[0]?.max_price ?? 0 },
      };
    });

    res.json({ data: facets });
  } catch (err) {
    console.error('[storefront] GET filters error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/storefront/products/:id/related — smart related products ───────
storefrontRouter.get('/products/:id/related', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  const limit = parseInt(req.query.limit as string) || 4;

  try {
    const products = await withTenantSchema(tenant.slug, async (db) => {
      // 1. Co-purchased: products frequently bought together (from order_items)
      const { rows: coPurchased } = await db.query(
        `SELECT p.id, p.name, p.price_cents, p.sale_price_cents, p.image_url, p.category,
                p.stock_qty, p.review_count, p.avg_rating, COUNT(*) AS co_count
         FROM order_items oi1
         JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id != oi1.product_id
         JOIN products p ON p.id = oi2.product_id AND p.is_active = true
         WHERE oi1.product_id = $1
         GROUP BY p.id
         ORDER BY co_count DESC
         LIMIT $2`,
        [req.params.id, limit],
      );

      if (coPurchased.length >= limit) return coPurchased;

      // 2. Fill remaining with same-category products
      const excludeIds = [req.params.id, ...coPurchased.map((r: Record<string, unknown>) => r.id)];
      const remaining = limit - coPurchased.length;

      const { rows: [source] } = await db.query('SELECT category FROM products WHERE id = $1', [req.params.id]);
      if (!source?.category) return coPurchased;

      const { rows: catProducts } = await db.query(
        `SELECT id, name, price_cents, sale_price_cents, image_url, category,
                stock_qty, review_count, avg_rating
         FROM products
         WHERE category = $1 AND is_active = true AND id != ALL($2::uuid[])
         ORDER BY is_featured DESC, created_at DESC
         LIMIT $3`,
        [source.category, excludeIds, remaining],
      );

      return [...coPurchased, ...catProducts];
    });

    res.json({ data: products });
  } catch (err) {
    console.error('[storefront] GET related error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/shipping/calculate ──────────────────────────────────
const shippingCalcSchema = z.object({
  subtotalCents: z.number().int().min(0),
  totalItems:    z.number().int().min(1),
  totalWeightOz: z.number().min(0).default(0),
  country:       z.string().length(2).default('US'),
  state:         z.string().max(10).optional(),
  zip:           z.string().max(20).optional(),
});

storefrontRouter.post('/shipping/calculate', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = shippingCalcSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues }); return; }

  const { subtotalCents, totalItems, totalWeightOz, country, state, zip } = parsed.data;

  try {
    const methods = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: zones } = await db.query(
        'SELECT * FROM shipping_zones WHERE is_active = true ORDER BY priority ASC'
      );

      const matchedZones = zones.filter((z: any) => {
        const countries = z.countries as string[];
        if (!countries.includes(country)) return false;
        const states = z.states as string[];
        if (states.length > 0 && state && !states.includes(state)) return false;
        const zips = z.zip_patterns as string[];
        if (zips.length > 0 && zip && !zips.some((p: string) => zip.startsWith(p))) return false;
        return true;
      });

      if (matchedZones.length === 0) return [];

      const zoneIds = matchedZones.map((z: any) => z.id);
      const { rows: allMethods } = await db.query(
        `SELECT m.*, z.name AS zone_name FROM shipping_methods m
         JOIN shipping_zones z ON z.id = m.zone_id
         WHERE m.zone_id = ANY($1::uuid[]) AND m.is_active = true
         ORDER BY m.position ASC`,
        [zoneIds],
      );
      return allMethods;
    });

    const available = methods.map((m: any) => {
      let costCents = 0;
      if (m.type === 'flat_rate') {
        costCents = (m.cost_cents as number) + (m.per_item_cents as number) * totalItems;
      } else if (m.type === 'weight_based') {
        costCents = (m.cost_cents as number) + Math.round((m.weight_rate_cents_per_oz as number) * totalWeightOz);
      }
      // free_shipping and local_pickup = 0

      if (m.free_above_cents != null && subtotalCents >= (m.free_above_cents as number)) {
        costCents = 0;
      }

      return {
        id: m.id as string,
        title: m.title as string,
        type: m.type as string,
        costCents,
        zoneName: m.zone_name as string,
      };
    });

    res.json({ methods: available });
  } catch (err) {
    console.error('[storefront] Shipping calculate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/tax/calculate ────────────────────────────────────────
const taxCalcSchema = z.object({
  subtotalCents: z.number().int().min(0),
  country:       z.string().length(2).default('US'),
  state:         z.string().max(10).optional(),
  zip:           z.string().max(20).optional(),
});

storefrontRouter.post('/tax/calculate', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = taxCalcSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues }); return; }

  const { subtotalCents, country, state, zip } = parsed.data;

  try {
    const taxLines = await withTenantSchema(tenant.slug, async (db) => {
      const conditions: string[] = ['z.is_active = true', 'z.country = $1'];
      const params: unknown[] = [country];

      let stateCondition = 'z.state IS NULL';
      if (state) {
        params.push(state);
        stateCondition = `(z.state IS NULL OR z.state = $${params.length})`;
      }
      conditions.push(stateCondition);

      const { rows: zones } = await db.query(
        `SELECT z.id, z.name, z.state, z.zip_pattern
         FROM tax_zones z
         WHERE ${conditions.join(' AND ')}
         ORDER BY z.priority ASC`,
        params,
      );

      const matchedZones = zones.filter((z: any) => {
        if (!z.zip_pattern) return true;
        if (!zip) return false;
        return zip.startsWith(z.zip_pattern);
      });

      if (matchedZones.length === 0) return [];

      const zoneIds = matchedZones.map((z: any) => z.id);
      const { rows: rates } = await db.query(
        `SELECT r.*, z.name AS zone_name FROM tax_rates r
         JOIN tax_zones z ON z.id = r.zone_id
         WHERE r.zone_id = ANY($1::uuid[])
         ORDER BY z.priority ASC`,
        [zoneIds],
      );
      return rates;
    });

    let taxCents = 0;
    const taxBreakdown: { name: string; ratePct: number; amountCents: number }[] = [];

    const nonCompound = taxLines.filter((r: any) => !r.is_compound);
    const compound = taxLines.filter((r: any) => r.is_compound);

    for (const rate of nonCompound) {
      const amount = Math.round(subtotalCents * (rate.rate_pct as number) / 100);
      taxCents += amount;
      taxBreakdown.push({ name: rate.name as string, ratePct: rate.rate_pct as number, amountCents: amount });
    }

    for (const rate of compound) {
      const amount = Math.round((subtotalCents + taxCents) * (rate.rate_pct as number) / 100);
      taxCents += amount;
      taxBreakdown.push({ name: rate.name as string, ratePct: rate.rate_pct as number, amountCents: amount });
    }

    res.json({ taxCents, breakdown: taxBreakdown });
  } catch (err) {
    console.error('[storefront] Tax calculate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/coupons/validate ────────────────────────────────────
const couponValidateSchema = z.object({
  code:       z.string().min(1).max(50).transform(s => s.toUpperCase().trim()),
  subtotalCents: z.number().int().min(0),
});

storefrontRouter.post('/coupons/validate', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = couponValidateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues }); return; }

  const { code, subtotalCents } = parsed.data;

  try {
    const coupon = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query('SELECT * FROM coupons WHERE code = $1 AND is_active = true', [code]);
      return rows[0] ?? null;
    });

    if (!coupon) { res.status(404).json({ error: 'Invalid coupon code' }); return; }

    // Check date validity
    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at as string) > now) {
      res.status(422).json({ error: 'Coupon is not yet active' }); return;
    }
    if (coupon.expires_at && new Date(coupon.expires_at as string) < now) {
      res.status(422).json({ error: 'Coupon has expired' }); return;
    }

    // Check usage limits
    if (coupon.max_uses != null && (coupon.uses_count as number) >= (coupon.max_uses as number)) {
      res.status(422).json({ error: 'Coupon usage limit reached' }); return;
    }

    // Check minimum order
    if (subtotalCents < (coupon.min_order_cents as number)) {
      const minStr = ((coupon.min_order_cents as number) / 100).toFixed(2);
      res.status(422).json({ error: `Minimum order of $${minStr} required` }); return;
    }

    // Calculate discount
    let discountCents = 0;
    if (coupon.type === 'percentage') {
      discountCents = Math.round(subtotalCents * (coupon.value as number) / 100);
    } else if (coupon.type === 'fixed') {
      discountCents = Math.round((coupon.value as number) * 100);
    }
    // free_shipping discount is 0 (handled by shipping layer)

    // Don't let discount exceed subtotal
    discountCents = Math.min(discountCents, subtotalCents);

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountCents,
      },
    });
  } catch (err) {
    console.error('[storefront] Coupon validate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/storefront/checkout ─────────────────────────────────────────────
const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity:  z.number().int().min(1).max(1000),
  })).min(1).max(50),
  successUrl:    z.string().url(),
  cancelUrl:     z.string().url(),
  customerEmail: z.string().email().optional(),
  couponCode:    z.string().max(50).optional(),
});

storefrontRouter.post('/checkout', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  const { items, successUrl, cancelUrl, customerEmail, couponCode } = parsed.data;

  const isWholesale = req.user?.isWholesale === true;

  type ProdRow = { id: string; name: string; price_cents: number; wholesale_price_cents: number | null; wholesale_only: boolean; stock_qty: number; image_url: string | null; is_active: boolean; product_type: string };
  type VarRow = { id: string; product_id: string; sku: string | null; price_cents: number | null; stock: number; image_url: string | null; is_active: boolean; attributes: Record<string, string> };

  try {
    // 1. Fetch product details from DB to get authoritative prices
    const productIds = items.map((i) => i.productId);
    const variantIds = items.filter((i) => i.variantId).map((i) => i.variantId!);

    const { products, variants } = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: prodRows } = await db.query(
        `SELECT id, name, price_cents, wholesale_price_cents, wholesale_only, stock_qty, image_url, is_active, product_type
         FROM products WHERE id = ANY($1::uuid[])`,
        [productIds],
      );
      let varRows: VarRow[] = [];
      if (variantIds.length > 0) {
        const vResult = await db.query(
          `SELECT id, product_id, sku, price_cents, stock, image_url, is_active, attributes
           FROM product_variants WHERE id = ANY($1::uuid[])`,
          [variantIds],
        );
        varRows = vResult.rows as VarRow[];
      }
      return { products: prodRows as ProdRow[], variants: varRows };
    });

    // Validate all products exist, are active, and have sufficient stock
    const productMap = new Map<string, ProdRow>(products.map((p) => [p.id, p]));
    const variantMap = new Map<string, VarRow>(variants.map((v) => [v.id, v]));

    for (const item of items) {
      const p = productMap.get(item.productId);
      if (!p)              { res.status(422).json({ error: `Product ${item.productId} not found` }); return; }
      if (!p.is_active)    { res.status(422).json({ error: `Product "${p.name}" is unavailable` }); return; }
      if (p.wholesale_only && !isWholesale) {
        res.status(422).json({ error: `Product "${p.name}" is unavailable` }); return;
      }

      if (item.variantId) {
        const v = variantMap.get(item.variantId);
        if (!v || v.product_id !== item.productId) { res.status(422).json({ error: `Variant ${item.variantId} not found` }); return; }
        if (!v.is_active) { res.status(422).json({ error: `Variant of "${p.name}" is unavailable` }); return; }
        if (v.stock < item.quantity) { res.status(422).json({ error: `Insufficient stock for "${p.name}" variant` }); return; }
      } else {
        if (p.stock_qty < item.quantity) { res.status(422).json({ error: `Insufficient stock for "${p.name}"` }); return; }
      }
    }

    // Helper: compute effective price for an item (variant price overrides product price)
    function effectivePrice(item: { productId: string; variantId?: string }): number {
      const p = productMap.get(item.productId)!;
      if (item.variantId) {
        const v = variantMap.get(item.variantId)!;
        if (v.price_cents != null) return v.price_cents;
      }
      if (isWholesale && p.wholesale_price_cents != null) return p.wholesale_price_cents;
      return p.price_cents;
    }

    // Helper: get display name for line item (include variant attributes)
    function lineItemName(item: { productId: string; variantId?: string }): string {
      const p = productMap.get(item.productId)!;
      if (item.variantId) {
        const v = variantMap.get(item.variantId)!;
        const attrStr = Object.values(v.attributes).join(' / ');
        return attrStr ? `${p.name} — ${attrStr}` : p.name;
      }
      return p.name;
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
    const subtotalCents = items.reduce((sum, item) => {
      return sum + effectivePrice(item) * item.quantity;
    }, 0);

    // 2b. Validate and apply coupon if provided
    let couponDiscountCents = 0;
    let couponId: string | null = null;
    if (couponCode) {
      const coupon = await withTenantSchema(tenant.slug, async (db) => {
        const { rows } = await db.query('SELECT * FROM coupons WHERE code = $1 AND is_active = true', [couponCode.toUpperCase().trim()]);
        return rows[0] ?? null;
      });
      if (!coupon) { res.status(422).json({ error: 'Invalid coupon code' }); return; }
      const now = new Date();
      if (coupon.starts_at && new Date(coupon.starts_at as string) > now) { res.status(422).json({ error: 'Coupon not yet active' }); return; }
      if (coupon.expires_at && new Date(coupon.expires_at as string) < now) { res.status(422).json({ error: 'Coupon has expired' }); return; }
      if (coupon.max_uses != null && (coupon.uses_count as number) >= (coupon.max_uses as number)) { res.status(422).json({ error: 'Coupon usage limit reached' }); return; }
      if (subtotalCents < (coupon.min_order_cents as number)) { res.status(422).json({ error: 'Minimum order not met for coupon' }); return; }

      couponId = coupon.id as string;
      if (coupon.type === 'percentage') {
        couponDiscountCents = Math.round(subtotalCents * (coupon.value as number) / 100);
      } else if (coupon.type === 'fixed') {
        couponDiscountCents = Math.round((coupon.value as number) * 100);
      }
      couponDiscountCents = Math.min(couponDiscountCents, subtotalCents);
    }

    const totalCents = subtotalCents - couponDiscountCents;

    // 3. Build Stripe line items (using effective prices based on variant/wholesale)
    const stripe = getStripe();
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => {
      const p = productMap.get(item.productId)!;
      const v = item.variantId ? variantMap.get(item.variantId) : null;
      const imgUrl = v?.image_url ?? p.image_url;
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: lineItemName(item),
            ...(imgUrl ? { images: [imgUrl] } : {}),
          },
          unit_amount: effectivePrice(item),
        },
        quantity: item.quantity,
      };
    });

    // Create a Stripe coupon on-the-fly if we have a discount
    let stripeCouponId: string | undefined;
    if (couponDiscountCents > 0) {
      const stripeCoupon = await stripe.coupons.create({
        amount_off: couponDiscountCents,
        currency:   'usd',
        duration:   'once',
        name:       `Coupon: ${couponCode!.toUpperCase()}`,
      });
      stripeCouponId = stripeCoupon.id;
    }

    // 4. Create Stripe Checkout Session (with Connect if enabled)
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode:        'payment',
      line_items:  lineItems,
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl,
      ...(customerEmail ? { customer_email: customerEmail }
          : req.user?.role === 'customer' ? { customer_email: req.user.email } : {}),
      metadata: {
        tenant_slug: tenant.slug,
        items_json:  JSON.stringify(items),
        ...(req.user?.role === 'customer' ? { customer_id: req.user.userId } : {}),
        ...(isWholesale ? { is_wholesale: 'true' } : {}),
        ...(couponId ? { coupon_id: couponId, coupon_code: couponCode!.toUpperCase() } : {}),
        ...(couponDiscountCents > 0 ? { coupon_discount_cents: String(couponDiscountCents) } : {}),
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
    const items: Array<{ productId: string; variantId?: string; quantity: number }> = JSON.parse(itemsJson);
    const customerId = session.metadata?.customer_id ?? null;

    // Fetch authoritative product data & build order — wrapped in a transaction
    // so stock decrements and order creation are atomic (idempotent on replay).
    await withTenantSchema(tenantSlug, async (db) => {
      await db.query('BEGIN');
      try {
      const productIds = items.map((i) => i.productId);
      const variantIds = items.filter((i) => i.variantId).map((i) => i.variantId!);

      const { rows: products } = await db.query(
        'SELECT id, name, price_cents, wholesale_price_cents, sku, stock_qty FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE',
        [productIds],
      );
      const productMap = new Map(
        (products as Array<{ id: string; name: string; price_cents: number; wholesale_price_cents: number | null; sku: string }>)
          .map((p) => [p.id, p]),
      );

      // Fetch variants if needed
      type WHVariant = { id: string; product_id: string; sku: string | null; price_cents: number | null; stock: number; attributes: Record<string, string> };
      const variantMap = new Map<string, WHVariant>();
      if (variantIds.length > 0) {
        const { rows: vRows } = await db.query(
          'SELECT id, product_id, sku, price_cents, stock, attributes FROM product_variants WHERE id = ANY($1::uuid[]) FOR UPDATE',
          [variantIds],
        );
        for (const v of vRows as WHVariant[]) variantMap.set(v.id, v);
      }

      // Determine if this was a wholesale order from metadata
      const isWholesaleOrder = session.metadata?.is_wholesale === 'true';

      const totalCents = items.reduce((sum, item) => {
        const p = productMap.get(item.productId);
        if (!p) return sum;
        if (item.variantId) {
          const v = variantMap.get(item.variantId);
          if (v?.price_cents != null) return sum + v.price_cents * item.quantity;
        }
        const price = (isWholesaleOrder && p.wholesale_price_cents != null) ? p.wholesale_price_cents : p.price_cents;
        return sum + price * item.quantity;
      }, 0);

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // Create order (link to customer account if available)
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId && session.customer_details?.email) {
        const { rows: custRows } = await db.query(
          'SELECT id FROM customers WHERE email = $1 LIMIT 1',
          [session.customer_details.email],
        );
        if (custRows[0]) resolvedCustomerId = custRows[0].id as string;
      }

      const { rows: orderRows } = await db.query(
        `INSERT INTO orders
           (order_number, customer_name, customer_email, customer_id, status,
            total_cents, stripe_payment_intent_id, stripe_session_id)
         VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7)
         RETURNING id, order_number`,
        [
          orderNumber,
          session.customer_details?.name ?? 'Customer',
          session.customer_details?.email ?? null,
          resolvedCustomerId,
          totalCents,
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
          session.id,
        ],
      );
      const orderId = orderRows[0].id as string;

      // Create order items (variant-aware)
      for (const item of items) {
        const p = productMap.get(item.productId);
        if (!p) continue;
        const v = item.variantId ? variantMap.get(item.variantId) : null;
        const sku = v?.sku ?? p.sku;
        const attrStr = v ? Object.values(v.attributes).join(' / ') : '';
        const itemName = attrStr ? `${p.name} — ${attrStr}` : p.name;
        let unitPrice: number;
        if (v?.price_cents != null) {
          unitPrice = v.price_cents;
        } else {
          unitPrice = (isWholesaleOrder && p.wholesale_price_cents != null) ? p.wholesale_price_cents : p.price_cents;
        }
        await db.query(
          `INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, item.productId, sku, itemName, item.quantity, unitPrice],
        );

        // Decrement stock — variant stock if variant, else product stock
        if (v) {
          const { rows: [updated] } = await db.query(
            'UPDATE product_variants SET stock = GREATEST(0, stock - $1), updated_at = now() WHERE id = $2 RETURNING stock',
            [item.quantity, item.variantId],
          );
          if (updated && updated.stock === 0) {
            console.warn(`[webhook] Variant ${item.variantId} of product ${p.name} is now out of stock`);
          }
        } else {
          const { rows: [updated] } = await db.query(
            'UPDATE products SET stock_qty = GREATEST(0, stock_qty - $1), updated_at = now() WHERE id = $2 RETURNING stock_qty',
            [item.quantity, item.productId],
          );
          if (updated && updated.stock_qty === 0) {
            console.warn(`[webhook] Product ${item.productId} (${p.name}) is now out of stock`);
          }
        }
      }

      // Record coupon usage if applicable
      const webhookCouponId = session.metadata?.coupon_id;
      if (webhookCouponId) {
        await db.query(
          `INSERT INTO coupon_uses (coupon_id, customer_id, order_id) VALUES ($1, $2, $3)`,
          [webhookCouponId, resolvedCustomerId, orderId]
        );
        await db.query(
          'UPDATE coupons SET uses_count = uses_count + 1, updated_at = now() WHERE id = $1',
          [webhookCouponId]
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

// ── Wishlist ─────────────────────────────────────────────────────────────────

// GET /api/storefront/wishlist — get current customer's wishlist
storefrontRouter.get('/wishlist', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const items = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT w.id, w.product_id, w.variant_id, w.created_at,
                p.name, p.price_cents, p.sale_price_cents, p.image_url, p.stock_qty
         FROM wishlists w
         JOIN products p ON p.id = w.product_id
         WHERE w.customer_id = $1
         ORDER BY w.created_at DESC`,
        [req.user!.customerId],
      );
      return rows;
    });
    res.json({ data: items });
  } catch (err) {
    console.error('[storefront] GET wishlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/storefront/wishlist — add product to wishlist
storefrontRouter.post('/wishlist', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  const { productId, variantId } = req.body as { productId?: string; variantId?: string };
  if (!productId) { res.status(400).json({ error: 'productId required' }); return; }

  try {
    const item = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: [row] } = await db.query(
        `INSERT INTO wishlists (customer_id, product_id, variant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (customer_id, product_id, variant_id) DO NOTHING
         RETURNING *`,
        [req.user!.customerId, productId, variantId ?? null],
      );
      return row ?? null;
    });
    res.status(item ? 201 : 200).json({ data: item, added: !!item });
  } catch (err) {
    console.error('[storefront] POST wishlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/storefront/wishlist/:productId — remove from wishlist
storefrontRouter.delete('/wishlist/:productId', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    await withTenantSchema(tenant.slug, async (db) => {
      await db.query(
        'DELETE FROM wishlists WHERE customer_id = $1 AND product_id = $2',
        [req.user!.customerId, req.params.productId],
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[storefront] DELETE wishlist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Customer Addresses ───────────────────────────────────────────────────────

const addressSchema = z.object({
  label:      z.string().max(50).default('Home'),
  is_default: z.boolean().optional(),
  first_name: z.string().max(100),
  last_name:  z.string().max(100),
  line1:      z.string().max(255),
  line2:      z.string().max(255).optional(),
  city:       z.string().max(100),
  state:      z.string().max(100).optional(),
  postal:     z.string().max(20),
  country:    z.string().length(2).default('US'),
  phone:      z.string().max(30).optional(),
});

// GET /api/storefront/addresses
storefrontRouter.get('/addresses', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    const rows = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC',
        [req.user!.customerId],
      );
      return rows;
    });
    res.json({ data: rows });
  } catch (err) {
    console.error('[storefront] GET addresses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/storefront/addresses
storefrontRouter.post('/addresses', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  const parse = addressSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }

  const d = parse.data;
  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      // If setting as default, unset others first
      if (d.is_default) {
        await db.query('UPDATE customer_addresses SET is_default = false WHERE customer_id = $1', [req.user!.customerId]);
      }
      const { rows: [addr] } = await db.query(
        `INSERT INTO customer_addresses
           (customer_id, label, is_default, first_name, last_name, line1, line2, city, state, postal, country, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [req.user!.customerId, d.label, d.is_default ?? false, d.first_name, d.last_name,
         d.line1, d.line2 ?? null, d.city, d.state ?? null, d.postal, d.country, d.phone ?? null],
      );
      return addr;
    });
    res.status(201).json({ data: row });
  } catch (err) {
    console.error('[storefront] POST addresses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/storefront/addresses/:id
storefrontRouter.patch('/addresses/:id', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  const parse = addressSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed' }); return; }

  const d = parse.data;
  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      if (d.is_default) {
        await db.query('UPDATE customer_addresses SET is_default = false WHERE customer_id = $1', [req.user!.customerId]);
      }
      const sets: string[] = ['updated_at = now()'];
      const params: unknown[] = [req.params.id, req.user!.customerId];
      for (const [key, val] of Object.entries(d)) {
        params.push(val ?? null);
        sets.push(`${key} = $${params.length}`);
      }
      const { rows: [addr] } = await db.query(
        `UPDATE customer_addresses SET ${sets.join(', ')} WHERE id = $1 AND customer_id = $2 RETURNING *`,
        params,
      );
      return addr ?? null;
    });
    if (!row) { res.status(404).json({ error: 'Address not found' }); return; }
    res.json({ data: row });
  } catch (err) {
    console.error('[storefront] PATCH addresses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/storefront/addresses/:id
storefrontRouter.delete('/addresses/:id', optionalAuth, async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  if (!req.user?.customerId) { res.status(401).json({ error: 'Authentication required' }); return; }

  try {
    await withTenantSchema(tenant.slug, async (db) => {
      await db.query(
        'DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2',
        [req.params.id, req.user!.customerId],
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[storefront] DELETE addresses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Abandoned Carts ──────────────────────────────────────────────────────────

// POST /api/storefront/abandoned-cart — save cart for recovery
storefrontRouter.post('/abandoned-cart', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const { email, cart_data, total_cents } = req.body as {
    email?: string; cart_data?: unknown[]; total_cents?: number;
  };
  if (!email || !cart_data || !cart_data.length) {
    res.status(400).json({ error: 'email and cart_data required' }); return;
  }

  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      // Upsert by email — update if cart already saved
      const { rows: [cart] } = await db.query(
        `INSERT INTO abandoned_carts (email, cart_data, total_cents, customer_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) WHERE recovered_at IS NULL
         DO UPDATE SET cart_data = $2, total_cents = $3, updated_at = now()
         RETURNING *`,
        [email, JSON.stringify(cart_data), total_cents ?? 0, req.user?.customerId ?? null],
      );
      return cart;
    });
    res.json({ data: row });
  } catch (err) {
    // Unique constraint may fail on conflict clause syntax — fallback to insert
    console.error('[storefront] abandoned cart save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Pages / CMS (Public) ────────────────────────────────────────────────────

// GET /api/storefront/pages — list published pages
storefrontRouter.get('/pages', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const rows = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        'SELECT id, slug, title, seo_title, seo_description, position FROM pages WHERE is_published = true ORDER BY position ASC'
      );
      return rows;
    });
    res.json({ data: rows });
  } catch (err) {
    console.error('[storefront] GET pages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/storefront/pages/:slug — get single published page
storefrontRouter.get('/pages/:slug', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const page = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: [row] } = await db.query(
        'SELECT * FROM pages WHERE slug = $1 AND is_published = true', [req.params.slug]
      );
      return row ?? null;
    });
    if (!page) { res.status(404).json({ error: 'Page not found' }); return; }
    res.json({ data: page });
  } catch (err) {
    console.error('[storefront] GET page error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Navigation Menus (Public) ───────────────────────────────────────────────

// GET /api/storefront/nav-menus — get all menus
storefrontRouter.get('/nav-menus', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const rows = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query('SELECT location, items FROM nav_menus');
      return rows;
    });
    const menus: Record<string, unknown[]> = {};
    for (const row of rows) {
      menus[(row as Record<string, unknown>).location as string] = (row as Record<string, unknown>).items as unknown[];
    }
    res.json({ data: menus });
  } catch (err) {
    console.error('[storefront] GET nav-menus error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Blog (Public) ───────────────────────────────────────────────────────────

// GET /api/storefront/blog — list published posts
storefrontRouter.get('/blog', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }
  const { page = '1', limit = '10' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const rows = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT id, slug, title, excerpt, featured_image, tags, published_at,
                COUNT(*) OVER() AS total_count
         FROM blog_posts WHERE status = 'published'
         ORDER BY published_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit as string), offset],
      );
      return rows;
    });

    const total = rows[0]?.total_count ?? 0;
    res.json({
      data: rows.map((r: Record<string, unknown>) => { const { total_count, ...rest } = r; return rest; }),
      meta: { page: parseInt(page as string), limit: parseInt(limit as string), total: parseInt(total as string) },
    });
  } catch (err) {
    console.error('[storefront] GET blog error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/storefront/blog/:slug — get single published post
storefrontRouter.get('/blog/:slug', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  try {
    const post = await withTenantSchema(tenant.slug, async (db) => {
      const { rows: [row] } = await db.query(
        "SELECT * FROM blog_posts WHERE slug = $1 AND status = 'published'", [req.params.slug]
      );
      return row ?? null;
    });
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
    res.json({ data: post });
  } catch (err) {
    console.error('[storefront] GET blog post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
