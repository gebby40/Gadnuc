import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';
import { emitWebhookEvent } from '../services/webhooks.js';
import { logAuditEvent } from '../middleware/audit.js';

export const productsRouter = Router();

// All product routes require authentication
productsRouter.use(requireAuth);

const productSchema = z.object({
  sku:         z.string().min(1).max(100),
  name:        z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  category:    z.string().max(100).optional(),
  price_cents: z.number().int().min(0),
  stock_qty:   z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(10),
  image_url:   z.string().url().optional(),
  is_active:   z.boolean().default(true),
  metadata:    z.record(z.unknown()).default({}),
});

const UPDATABLE_PRODUCT_FIELDS = new Set([
  'sku', 'name', 'description', 'category', 'price_cents', 'stock_qty',
  'low_stock_threshold', 'image_url', 'is_active', 'metadata',
]);

// GET /api/products — list all products for this tenant
productsRouter.get('/', async (req, res) => {
  const slug = req.tenantSlug!;
  const { category, search, active } = req.query;

  try {
    await withTenantSchema(slug, async (db) => {
      const conditions: string[] = ['1=1'];
      const params: unknown[] = [];

      if (category) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
      }
      if (active !== undefined) {
        params.push(active === 'true');
        conditions.push(`is_active = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length})`);
      }

      const { rows } = await db.query(
        `SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
        params
      );
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[products] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/:id
productsRouter.get('/:id', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM products WHERE id = $1',
        [req.params.id]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Product not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[products] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products — create (requires operator+)
productsRouter.post('/', requireRole('operator'), async (req, res) => {
  const parse = productSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO products
           (sku, name, description, category, price_cents, stock_qty,
            low_stock_threshold, image_url, is_active, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [d.sku, d.name, d.description ?? null, d.category ?? null,
         d.price_cents, d.stock_qty, d.low_stock_threshold,
         d.image_url ?? null, d.is_active, JSON.stringify(d.metadata)]
      );
      res.status(201).json({ data: rows[0] });

      logAuditEvent({ req, action: 'product.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: rows[0].id, sku: d.sku } });

      emitWebhookEvent(req.user!.tenantId, 'product.created', {
        product_id: rows[0].id, sku: d.sku, name: d.name,
      }).catch(() => {});
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'SKU already exists' });
      return;
    }
    console.error('[products] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/:id
productsRouter.patch('/:id', requireRole('operator'), async (req, res) => {
  const parse = productSchema.partial().safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const updates = parse.data;
  const fields = (Object.keys(updates) as Array<keyof typeof updates>).filter(f => UPDATABLE_PRODUCT_FIELDS.has(f));
  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => updates[f]);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE products SET ${setClauses}, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Product not found' }); return; }
      res.json({ data: rows[0] });

      logAuditEvent({ req, action: 'product.updated', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: req.params.id } });

      emitWebhookEvent(req.user!.tenantId, 'product.updated', {
        product_id: req.params.id,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[products] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/:id — requires tenant_admin
productsRouter.delete('/:id', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query(
        'DELETE FROM products WHERE id = $1',
        [req.params.id]
      );
      if (!rowCount) { res.status(404).json({ error: 'Product not found' }); return; }
      res.status(204).send();

      logAuditEvent({ req, action: 'product.deleted', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: req.params.id } });

      emitWebhookEvent(req.user!.tenantId, 'product.deleted', {
        product_id: req.params.id,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[products] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
