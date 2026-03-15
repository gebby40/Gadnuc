/**
 * Customer account routes for tenant storefronts.
 *
 * Public:
 *   POST /api/customers/register   — create a customer account
 *   POST /api/customers/login      — customer login
 *
 * Customer auth (requireAuth + requireRole('customer')):
 *   GET    /api/customers/me        — current customer profile
 *   PATCH  /api/customers/me        — update profile
 *   GET    /api/customers/me/orders — customer's order history
 *
 * Admin auth (requireRole('tenant_admin')):
 *   GET    /api/customers           — list all customers
 *   GET    /api/customers/:id       — customer detail
 *   PATCH  /api/customers/:id       — edit customer (admin)
 *   DELETE /api/customers/:id       — remove customer
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, hashPassword, verifyPassword, signAccessToken } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';
import { emitWebhookEvent } from '../services/webhooks.js';
import { logAuditEvent } from '../middleware/audit.js';
import { authRateLimit } from '../middleware/tenant-rate-limit.js';
import {
  generateRefreshToken,
  storeRefreshToken,
} from '../services/token-store.js';
import type { Request, Response } from 'express';

export const customersRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'customer_refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge:   30 * 24 * 60 * 60 * 1000,
  path:     '/api/customers',
};

function setCustomerRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTS);
}

async function issueCustomerTokenPair(
  res: Response,
  customer: { id: string; email: string; is_wholesale?: boolean },
  tenantId: string,
  tenantSlug: string,
) {
  const accessToken = await signAccessToken({
    sub: customer.id,
    tenantId,
    tenantSlug,
    role: 'customer',
    email: customer.email,
    isWholesale: customer.is_wholesale ?? false,
  });
  const refreshToken = generateRefreshToken();
  await storeRefreshToken({ token: refreshToken, userId: customer.id, tenantId });
  setCustomerRefreshCookie(res, refreshToken);
  return { accessToken };
}

// ── Validation schemas ───────────────────────────────────────────────────────

const registerSchema = z.object({
  email:      z.string().email(),
  password:   z.string().min(8).max(256),
  first_name: z.string().max(100).optional(),
  last_name:  z.string().max(100).optional(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  first_name:      z.string().max(100).optional(),
  last_name:       z.string().max(100).optional(),
  phone:           z.string().max(30).optional(),
  default_address: z.object({
    line1:   z.string().max(255),
    line2:   z.string().max(255).optional(),
    city:    z.string().max(100),
    state:   z.string().max(100),
    zip:     z.string().max(20),
    country: z.string().max(100),
  }).optional(),
  password: z.string().min(8).max(256).optional(),
});

const adminUpdateSchema = z.object({
  first_name:   z.string().max(100).optional(),
  last_name:    z.string().max(100).optional(),
  phone:        z.string().max(30).optional(),
  is_active:    z.boolean().optional(),
  is_wholesale: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/customers/register
customersRouter.post('/register', authRateLimit(), async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { email, password, first_name, last_name } = parse.data;
  const password_hash = await hashPassword(password);

  try {
    const customer = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO customers (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, first_name, last_name, is_wholesale, created_at`,
        [email, password_hash, first_name ?? null, last_name ?? null],
      );
      return rows[0] as { id: string; email: string; first_name: string | null; last_name: string | null; is_wholesale: boolean; created_at: string };
    });

    const { accessToken } = await issueCustomerTokenPair(res, customer, tenant.id, tenant.slug);

    logAuditEvent({ req, action: 'customer.registered', tenantId: tenant.id, userId: null, metadata: { customer_id: customer.id, email } });

    emitWebhookEvent(tenant.id, 'customer.registered', {
      customer_id: customer.id, email,
    }).catch(() => {});

    res.status(201).json({
      access_token: accessToken,
      token_type: 'Bearer',
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
      },
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    console.error('[customers] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/login
customersRouter.post('/login', authRateLimit(), async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { email, password } = parse.data;

  try {
    const customer = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query<{
        id: string; email: string; password_hash: string;
        first_name: string | null; last_name: string | null; is_active: boolean; is_wholesale: boolean;
      }>(
        'SELECT id, email, password_hash, first_name, last_name, is_active, is_wholesale FROM customers WHERE email = $1 LIMIT 1',
        [email],
      );
      return rows[0] ?? null;
    });

    // Constant-time: always verify even when customer is missing
    const hashToCheck = customer?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
    const valid = await verifyPassword(password, hashToCheck);

    if (!customer || !valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!customer.is_active) {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    // Update last_login_at
    await withTenantSchema(tenant.slug, async (db) => {
      await db.query('UPDATE customers SET last_login_at = now() WHERE id = $1', [customer.id]);
    });

    const { accessToken } = await issueCustomerTokenPair(res, customer, tenant.id, tenant.slug);

    logAuditEvent({ req, action: 'customer.login', tenantId: tenant.id, userId: null, metadata: { customer_id: customer.id } });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
      },
    });
  } catch (err) {
    console.error('[customers] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER AUTH ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/customers/me
customersRouter.get('/me', requireAuth, requireRole('customer'), async (req: Request, res: Response) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT id, email, first_name, last_name, phone, default_address,
                is_active, is_wholesale, last_login_at, created_at
         FROM customers WHERE id = $1`,
        [req.user!.userId],
      );
      if (!rows[0]) { res.status(404).json({ error: 'Customer not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[customers] GET /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/customers/me
customersRouter.patch('/me', requireAuth, requireRole('customer'), async (req: Request, res: Response) => {
  const parse = updateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const updates: Record<string, unknown> = { ...parse.data };
  if (updates.password) {
    updates.password_hash = await hashPassword(updates.password as string);
    delete updates.password;
  }
  if (updates.default_address) {
    updates.default_address = JSON.stringify(updates.default_address);
  }

  const fields = Object.keys(updates).filter(k => updates[k] !== undefined);
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE customers SET ${setClauses}, updated_at = now() WHERE id = $1
         RETURNING id, email, first_name, last_name, phone, default_address`,
        [req.user!.userId, ...fields.map(f => updates[f])],
      );
      if (!rows[0]) { res.status(404).json({ error: 'Customer not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[customers] PATCH /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/me/orders
customersRouter.get('/me/orders', requireAuth, requireRole('customer'), async (req: Request, res: Response) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT o.id, o.order_number, o.status, o.total_cents,
                o.shipping_address, o.created_at,
                json_agg(json_build_object(
                  'sku', oi.sku, 'name', oi.name,
                  'quantity', oi.quantity, 'unit_price_cents', oi.unit_price_cents,
                  'image_url', p.image_url
                ) ORDER BY oi.id) AS items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE o.customer_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [req.user!.userId],
      );
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[customers] GET /me/orders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/customers — list all customers (tenant_admin+)
customersRouter.get('/', requireAuth, requireRole('tenant_admin'), async (req: Request, res: Response) => {
  const search   = (req.query.search as string) ?? '';
  const status   = (req.query.status as string) ?? '';
  const perPage  = Math.min(100, Math.max(1, parseInt(req.query.per_page as string, 10) || 25));
  const page     = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const offset   = (page - 1) * perPage;

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        conditions.push(`(lower(email) LIKE $${params.length} OR lower(first_name) LIKE $${params.length} OR lower(last_name) LIKE $${params.length})`);
      }

      if (status === 'active') {
        conditions.push('is_active = true');
      } else if (status === 'inactive') {
        conditions.push('is_active = false');
      }

      const where = conditions.length > 0 ? conditions.join(' AND ') : 'TRUE';

      const countRes = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM customers WHERE ${where}`, params,
      );
      const total = countRes.rows[0]?.cnt ?? 0;

      params.push(perPage, offset);
      const { rows } = await db.query(
        `SELECT c.id, c.email, c.first_name, c.last_name, c.phone,
                c.is_active, c.is_wholesale, c.last_login_at, c.created_at,
                (SELECT COUNT(*)::int FROM orders WHERE customer_id = c.id) AS order_count
         FROM customers c
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      res.json({ data: rows, total, page, per_page: perPage });
    });
  } catch (err) {
    console.error('[customers] GET / error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/:id — customer detail (tenant_admin+)
customersRouter.get('/:id', requireAuth, requireRole('tenant_admin'), async (req: Request, res: Response) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT c.*, (SELECT COUNT(*)::int FROM orders WHERE customer_id = c.id) AS order_count
         FROM customers c WHERE c.id = $1`,
        [req.params.id],
      );
      if (!rows[0]) { res.status(404).json({ error: 'Customer not found' }); return; }
      // Don't expose password_hash
      const { password_hash: _, ...customer } = rows[0] as Record<string, unknown>;
      res.json({ data: customer });
    });
  } catch (err) {
    console.error('[customers] GET /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/customers/:id — admin edit (tenant_admin+)
customersRouter.patch('/:id', requireAuth, requireRole('tenant_admin'), async (req: Request, res: Response) => {
  const parse = adminUpdateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const updates = parse.data;
  const fields = Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== undefined);
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE customers SET ${setClauses}, updated_at = now() WHERE id = $1
         RETURNING id, email, first_name, last_name, phone, is_active, is_wholesale`,
        [req.params.id, ...fields.map(f => (updates as Record<string, unknown>)[f])],
      );
      if (!rows[0]) { res.status(404).json({ error: 'Customer not found' }); return; }
      res.json({ data: rows[0] });

      emitWebhookEvent(req.user!.tenantId, 'customer.updated', {
        customer_id: req.params.id,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[customers] PATCH /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:id — remove customer (tenant_admin+)
customersRouter.delete('/:id', requireAuth, requireRole('tenant_admin'), async (req: Request, res: Response) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [target] } = await db.query(
        'SELECT id, email FROM customers WHERE id = $1',
        [req.params.id],
      );
      if (!target) { res.status(404).json({ error: 'Customer not found' }); return; }

      // Wrap in transaction so nullifying orders + deleting customer is atomic
      await db.query('BEGIN');
      try {
        await db.query('UPDATE orders SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);
        await db.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
        await db.query('COMMIT');
      } catch (txErr) {
        await db.query('ROLLBACK');
        throw txErr;
      }
      res.status(204).send();

      logAuditEvent({ req, action: 'customer.deleted', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { customer_id: req.params.id, email: (target as Record<string, unknown>).email } });

      emitWebhookEvent(req.user!.tenantId, 'customer.deleted', {
        customer_id: req.params.id,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[customers] DELETE /:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
