import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';
import { emitWebhookEvent } from '../services/webhooks.js';
import { logAuditEvent } from '../middleware/audit.js';

export const productsRouter = Router();

// Helper: escape a value for CSV output
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// All product routes require authentication
productsRouter.use(requireAuth);

const productSchema = z.object({
  sku:         z.string().min(1).max(100),
  name:        z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  category:    z.string().max(100).optional(),
  price_cents: z.number().int().min(0),
  sale_price_cents: z.number().int().min(0).nullable().optional(),
  stock_qty:   z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(10),
  image_url:   z.string().url().optional(),
  is_active:   z.boolean().default(true),
  metadata:    z.record(z.unknown()).default({}),
  weight_oz:   z.number().min(0).nullable().optional(),
  length_in:   z.number().min(0).nullable().optional(),
  width_in:    z.number().min(0).nullable().optional(),
  height_in:   z.number().min(0).nullable().optional(),
  shipping_class: z.string().max(50).default('standard'),
  tags:        z.array(z.string().max(50)).default([]),
  brand:       z.string().max(100).nullable().optional(),
  is_featured: z.boolean().default(false),
});

const UPDATABLE_PRODUCT_FIELDS = new Set([
  'sku', 'name', 'description', 'category', 'price_cents', 'sale_price_cents',
  'stock_qty', 'low_stock_threshold', 'image_url', 'is_active', 'metadata',
  'weight_oz', 'length_in', 'width_in', 'height_in', 'shipping_class',
  'tags', 'brand', 'is_featured',
]);

// GET /api/products — list all products for this tenant (with pagination)
productsRouter.get('/', async (req, res) => {
  const slug = req.tenantSlug!;
  const { category, search, active } = req.query;
  const limit  = Math.min(Math.max(parseInt(req.query.limit as string)  || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

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

      const where = conditions.join(' AND ');

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS total FROM products WHERE ${where}`,
        params
      );
      const total = countResult.rows[0]?.total ?? 0;

      // Get paginated rows
      params.push(limit, offset);
      const { rows } = await db.query(
        `SELECT * FROM products WHERE ${where} ORDER BY name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      res.json({ data: rows, pagination: { total, limit, offset } });
    });
  } catch (err) {
    console.error('[products] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/export — download all products as CSV
productsRouter.get('/export', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT sku, name, description, category, price_cents, sale_price_cents,
                stock_qty, low_stock_threshold, image_url, is_active,
                weight_oz, length_in, width_in, height_in, shipping_class,
                tags, brand, is_featured
         FROM products ORDER BY name ASC`
      );

      const csvHeaders = 'sku,name,description,category,price_cents,sale_price_cents,stock_qty,low_stock_threshold,image_url,is_active,weight_oz,length_in,width_in,height_in,shipping_class,tags,brand,is_featured';
      const csvRows = rows.map(r => {
        return [
          csvEscape(r.sku),
          csvEscape(r.name),
          csvEscape(r.description ?? ''),
          csvEscape(r.category ?? ''),
          String(r.price_cents),
          String(r.sale_price_cents ?? ''),
          String(r.stock_qty),
          String(r.low_stock_threshold),
          csvEscape(r.image_url ?? ''),
          String(r.is_active),
          String(r.weight_oz ?? ''),
          String(r.length_in ?? ''),
          String(r.width_in ?? ''),
          String(r.height_in ?? ''),
          csvEscape(r.shipping_class ?? 'standard'),
          csvEscape((r.tags ?? []).join(';')),
          csvEscape(r.brand ?? ''),
          String(r.is_featured),
        ].join(',');
      });

      const csv = [csvHeaders, ...csvRows].join('\n');
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="products.csv"');
      res.send(csv);
    });
  } catch (err) {
    console.error('[products] Export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/bulk — bulk update multiple products
productsRouter.patch('/bulk', requireRole('operator'), async (req, res) => {
  const bulkSchema = z.object({
    updates: z.array(z.object({
      id: z.string().uuid(),
    }).catchall(z.unknown())).min(1).max(200),
  });

  const parse = bulkSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { updates } = parse.data;
  const results: { updated: number; errors: { id: string; error: string }[] } = { updated: 0, errors: [] };

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      await db.query('BEGIN');
      try {
        for (const item of updates) {
          const { id, ...fieldValues } = item;

          // Validate fields through partial product schema
          const fieldParse = productSchema.partial().safeParse(fieldValues);
          if (!fieldParse.success) {
            results.errors.push({ id, error: fieldParse.error.errors.map(e => e.message).join(', ') });
            continue;
          }

          const fields = (Object.keys(fieldParse.data) as Array<keyof typeof fieldParse.data>)
            .filter(f => UPDATABLE_PRODUCT_FIELDS.has(f));
          if (fields.length === 0) {
            results.errors.push({ id, error: 'No updatable fields provided' });
            continue;
          }

          const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
          const values = fields.map(f => f === 'metadata' ? JSON.stringify(fieldParse.data[f]) : fieldParse.data[f]);

          const { rowCount } = await db.query(
            `UPDATE products SET ${setClauses}, updated_at = now() WHERE id = $1`,
            [id, ...values]
          );

          if (rowCount) {
            results.updated++;
            logAuditEvent({ req, action: 'product.updated', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: id, bulk: true } });
          } else {
            results.errors.push({ id, error: 'Product not found' });
          }
        }
        await db.query('COMMIT');
      } catch (txErr) {
        await db.query('ROLLBACK');
        throw txErr;
      }
    });

    res.json(results);
  } catch (err) {
    console.error('[products] Bulk update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/import — bulk create/upsert from parsed CSV data
productsRouter.post('/import', requireRole('operator'), async (req, res) => {
  const importSchema = z.object({
    rows: z.array(productSchema).min(1).max(500),
    mode: z.enum(['create', 'upsert']),
  });

  const parse = importSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { rows: importRows, mode } = parse.data;
  const results: { created: number; updated: number; errors: { row: number; error: string }[] } = {
    created: 0, updated: 0, errors: [],
  };

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      await db.query('BEGIN');
      try {
        for (let i = 0; i < importRows.length; i++) {
          const d = importRows[i];
          try {
            if (mode === 'upsert') {
              // Try INSERT, on conflict UPDATE
              const { rows: upserted } = await db.query(
                `INSERT INTO products
                   (sku, name, description, category, price_cents, sale_price_cents,
                    stock_qty, low_stock_threshold, image_url, is_active, metadata,
                    weight_oz, length_in, width_in, height_in, shipping_class,
                    tags, brand, is_featured)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                 ON CONFLICT (sku) DO UPDATE SET
                   name = EXCLUDED.name,
                   description = EXCLUDED.description,
                   category = EXCLUDED.category,
                   price_cents = EXCLUDED.price_cents,
                   sale_price_cents = EXCLUDED.sale_price_cents,
                   stock_qty = EXCLUDED.stock_qty,
                   low_stock_threshold = EXCLUDED.low_stock_threshold,
                   image_url = EXCLUDED.image_url,
                   is_active = EXCLUDED.is_active,
                   metadata = EXCLUDED.metadata,
                   weight_oz = EXCLUDED.weight_oz,
                   length_in = EXCLUDED.length_in,
                   width_in = EXCLUDED.width_in,
                   height_in = EXCLUDED.height_in,
                   shipping_class = EXCLUDED.shipping_class,
                   tags = EXCLUDED.tags,
                   brand = EXCLUDED.brand,
                   is_featured = EXCLUDED.is_featured,
                   updated_at = now()
                 RETURNING (xmax = 0) AS is_insert`,
                [d.sku, d.name, d.description ?? null, d.category ?? null,
                 d.price_cents, d.sale_price_cents ?? null,
                 d.stock_qty, d.low_stock_threshold,
                 d.image_url ?? null, d.is_active, JSON.stringify(d.metadata),
                 d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
                 d.shipping_class, d.tags, d.brand ?? null, d.is_featured]
              );
              if (upserted[0]?.is_insert) {
                results.created++;
                logAuditEvent({ req, action: 'product.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { sku: d.sku, import: true } });
              } else {
                results.updated++;
                logAuditEvent({ req, action: 'product.updated', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { sku: d.sku, import: true } });
              }
            } else {
              // Create only
              await db.query(
                `INSERT INTO products
                   (sku, name, description, category, price_cents, sale_price_cents,
                    stock_qty, low_stock_threshold, image_url, is_active, metadata,
                    weight_oz, length_in, width_in, height_in, shipping_class,
                    tags, brand, is_featured)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
                [d.sku, d.name, d.description ?? null, d.category ?? null,
                 d.price_cents, d.sale_price_cents ?? null,
                 d.stock_qty, d.low_stock_threshold,
                 d.image_url ?? null, d.is_active, JSON.stringify(d.metadata),
                 d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
                 d.shipping_class, d.tags, d.brand ?? null, d.is_featured]
              );
              results.created++;
              logAuditEvent({ req, action: 'product.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { sku: d.sku, import: true } });
            }
          } catch (rowErr: unknown) {
            const code = (rowErr as { code?: string }).code;
            if (code === '23505') {
              results.errors.push({ row: i, error: `SKU "${d.sku}" already exists` });
            } else {
              results.errors.push({ row: i, error: (rowErr as Error).message ?? 'Unknown error' });
            }
          }
        }
        await db.query('COMMIT');
      } catch (txErr) {
        await db.query('ROLLBACK');
        throw txErr;
      }
    });

    res.json(results);
  } catch (err) {
    console.error('[products] Import error:', err);
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
           (sku, name, description, category, price_cents, sale_price_cents,
            stock_qty, low_stock_threshold, image_url, is_active, metadata,
            weight_oz, length_in, width_in, height_in, shipping_class,
            tags, brand, is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [d.sku, d.name, d.description ?? null, d.category ?? null,
         d.price_cents, d.sale_price_cents ?? null,
         d.stock_qty, d.low_stock_threshold,
         d.image_url ?? null, d.is_active, JSON.stringify(d.metadata),
         d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
         d.shipping_class, d.tags, d.brand ?? null, d.is_featured]
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
  const values = fields.map(f => f === 'metadata' ? JSON.stringify(updates[f]) : updates[f]);

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
