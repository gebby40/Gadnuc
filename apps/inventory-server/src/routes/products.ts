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
  sale_start:  z.string().datetime().nullable().optional(),
  sale_end:    z.string().datetime().nullable().optional(),
  wholesale_price_cents: z.number().int().min(0).nullable().optional(),
  wholesale_only: z.boolean().default(false),
  product_type: z.enum(['simple', 'variable']).default('simple'),
});

const UPDATABLE_PRODUCT_FIELDS = new Set([
  'sku', 'name', 'description', 'category', 'price_cents', 'sale_price_cents',
  'stock_qty', 'low_stock_threshold', 'image_url', 'is_active', 'metadata',
  'weight_oz', 'length_in', 'width_in', 'height_in', 'shipping_class',
  'tags', 'brand', 'is_featured', 'sale_start', 'sale_end', 'wholesale_price_cents', 'wholesale_only', 'product_type',
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
                tags, brand, is_featured, sale_start, sale_end, wholesale_price_cents, wholesale_only
         FROM products ORDER BY name ASC`
      );

      const csvHeaders = 'sku,name,description,category,price_cents,sale_price_cents,stock_qty,low_stock_threshold,image_url,is_active,weight_oz,length_in,width_in,height_in,shipping_class,tags,brand,is_featured,sale_start,sale_end,wholesale_price_cents,wholesale_only';
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
          r.sale_start ? new Date(r.sale_start).toISOString() : '',
          r.sale_end ? new Date(r.sale_end).toISOString() : '',
          String(r.wholesale_price_cents ?? ''),
          String(r.wholesale_only ?? false),
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

// ── WooCommerce CSV column mapping ──────────────────────────────────────────
function mapWooCommerceRow(wc: Record<string, string>): z.infer<typeof productSchema> {
  const priceCents = Math.round(parseFloat(wc['Regular price'] || wc['regular_price'] || '0') * 100);
  const salePriceRaw = wc['Sale price'] || wc['sale_price'] || '';
  const salePriceCents = salePriceRaw ? Math.round(parseFloat(salePriceRaw) * 100) : null;
  const weightRaw = wc['Weight (oz)'] || wc['Weight (lbs)'] || wc['weight'] || '';
  let weightOz: number | null = null;
  if (weightRaw) {
    const w = parseFloat(weightRaw);
    // WC often uses lbs; if column says lbs convert to oz
    weightOz = (wc['Weight (lbs)'] || wc['weight']) ? w * 16 : w;
  }
  const lengthRaw = wc['Length (in)'] || wc['length'] || '';
  const widthRaw  = wc['Width (in)']  || wc['width']  || '';
  const heightRaw = wc['Height (in)'] || wc['height'] || '';

  // Parse WC categories — "Cat1, Cat2 > SubCat" → take first top-level
  const catRaw = wc['Categories'] || wc['categories'] || '';
  const category = catRaw.split(',').map(c => c.split('>')[0].trim()).filter(Boolean)[0] || undefined;

  // Tags
  const tagsRaw = wc['Tags'] || wc['tags'] || '';
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Images — take first image URL
  const imagesRaw = wc['Images'] || wc['images'] || wc['Image'] || '';
  const imageUrl = imagesRaw.split(',')[0]?.trim() || undefined;

  // Metadata from WC attributes (Attribute 1 name/value, etc.)
  const metadata: Record<string, unknown> = {};
  for (let i = 1; i <= 10; i++) {
    const attrName  = wc[`Attribute ${i} name`]  || wc[`attribute_${i}_name`]  || '';
    const attrValue = wc[`Attribute ${i} value(s)`] || wc[`attribute_${i}_values`] || wc[`Attribute ${i} value`] || '';
    if (attrName && attrValue) {
      metadata[attrName] = attrValue;
    }
  }

  return {
    sku:         wc['SKU'] || wc['sku'] || `WC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:        wc['Name'] || wc['name'] || wc['post_title'] || 'Unnamed Product',
    description: wc['Description'] || wc['Short description'] || wc['description'] || undefined,
    category,
    price_cents: priceCents || 0,
    sale_price_cents: salePriceCents,
    stock_qty:   parseInt(wc['Stock'] || wc['stock'] || wc['stock_quantity'] || '0', 10) || 0,
    low_stock_threshold: parseInt(wc['Low stock amount'] || '10', 10) || 10,
    image_url:   imageUrl,
    is_active:   (wc['Published'] || wc['status'] || '1') !== '0' && (wc['Published'] || wc['status'] || 'publish') !== 'draft',
    metadata,
    weight_oz:   weightOz,
    length_in:   lengthRaw ? parseFloat(lengthRaw) : null,
    width_in:    widthRaw  ? parseFloat(widthRaw)  : null,
    height_in:   heightRaw ? parseFloat(heightRaw) : null,
    shipping_class: wc['Shipping class'] || wc['shipping_class'] || 'standard',
    tags,
    brand:       wc['Brand'] || wc['brand'] || null,
    is_featured: (wc['Is featured?'] || wc['featured'] || '0') === '1',
    sale_start:  wc['Date sale price starts'] || wc['sale_start'] || null,
    sale_end:    wc['Date sale price ends']   || wc['sale_end']   || null,
    wholesale_price_cents: wc['Wholesale price'] ? Math.round(parseFloat(wc['Wholesale price']) * 100) : null,
    wholesale_only: (wc['Wholesale only'] || wc['wholesale_only'] || '0') === '1' || (wc['Wholesale only'] || wc['wholesale_only'] || 'false') === 'true',
    product_type: 'simple' as const,
  };
}

// POST /api/products/import — bulk create/upsert from parsed CSV data
// Accepts format: 'gadnuc' (default) or 'woocommerce' for WC CSV rows
productsRouter.post('/import', requireRole('operator'), async (req, res) => {
  const { format } = req.body as { format?: string };

  // WooCommerce format: raw CSV rows with WC column names
  if (format === 'woocommerce') {
    const wcSchema = z.object({
      rows: z.array(z.record(z.string())).min(1).max(500),
      mode: z.enum(['create', 'upsert']),
      format: z.literal('woocommerce'),
    });
    const wcParse = wcSchema.safeParse(req.body);
    if (!wcParse.success) {
      res.status(400).json({ error: 'Validation failed', details: wcParse.error.flatten() });
      return;
    }

    // Map WC rows to Gadnuc product format
    const mappedRows: z.infer<typeof productSchema>[] = [];
    const mapErrors: { row: number; error: string }[] = [];
    for (let i = 0; i < wcParse.data.rows.length; i++) {
      try {
        const mapped = mapWooCommerceRow(wcParse.data.rows[i]);
        // Skip variable product parent rows (no price)
        if (mapped.price_cents === 0 && !mapped.sku) continue;
        const validated = productSchema.safeParse(mapped);
        if (!validated.success) {
          mapErrors.push({ row: i, error: validated.error.errors.map(e => e.message).join(', ') });
        } else {
          mappedRows.push(validated.data);
        }
      } catch (e) {
        mapErrors.push({ row: i, error: (e as Error).message });
      }
    }

    // Reuse the import logic below with mapped data
    req.body = { rows: mappedRows, mode: wcParse.data.mode };
    if (mapErrors.length > 0 && mappedRows.length === 0) {
      res.status(400).json({ error: 'All rows failed WooCommerce mapping', details: mapErrors });
      return;
    }
    // Fall through to standard import with mapped rows + any map errors stored
    (req as unknown as Record<string, unknown>)._wcMapErrors = mapErrors;
  }

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
                    tags, brand, is_featured, sale_start, sale_end, wholesale_price_cents, wholesale_only)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
                   sale_start = EXCLUDED.sale_start,
                   sale_end = EXCLUDED.sale_end,
                   wholesale_price_cents = EXCLUDED.wholesale_price_cents,
                   wholesale_only = EXCLUDED.wholesale_only,
                   updated_at = now()
                 RETURNING (xmax = 0) AS is_insert`,
                [d.sku, d.name, d.description ?? null, d.category ?? null,
                 d.price_cents, d.sale_price_cents ?? null,
                 d.stock_qty, d.low_stock_threshold,
                 d.image_url ?? null, d.is_active, JSON.stringify(d.metadata),
                 d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
                 d.shipping_class, d.tags, d.brand ?? null, d.is_featured,
                 d.sale_start ?? null, d.sale_end ?? null, d.wholesale_price_cents ?? null,
                 d.wholesale_only ?? false]
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
                    tags, brand, is_featured, sale_start, sale_end, wholesale_price_cents, wholesale_only)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
                [d.sku, d.name, d.description ?? null, d.category ?? null,
                 d.price_cents, d.sale_price_cents ?? null,
                 d.stock_qty, d.low_stock_threshold,
                 d.image_url ?? null, d.is_active, JSON.stringify(d.metadata),
                 d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
                 d.shipping_class, d.tags, d.brand ?? null, d.is_featured,
                 d.sale_start ?? null, d.sale_end ?? null, d.wholesale_price_cents ?? null,
                 d.wholesale_only ?? false]
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

    // Include WC mapping errors if present
    const wcMapErrors = (req as unknown as Record<string, unknown>)._wcMapErrors as { row: number; error: string }[] | undefined;
    if (wcMapErrors?.length) {
      results.errors.push(...wcMapErrors);
    }
    res.json(results);
  } catch (err) {
    console.error('[products] Import error:', err);
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
            tags, brand, is_featured, sale_start, sale_end, wholesale_price_cents, wholesale_only)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [d.sku, d.name, d.description ?? null, d.category ?? null,
         d.price_cents, d.sale_price_cents ?? null,
         d.stock_qty, d.low_stock_threshold,
         d.image_url ?? null, d.is_active, JSON.stringify(d.metadata),
         d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
         d.shipping_class, d.tags, d.brand ?? null, d.is_featured,
         d.sale_start ?? null, d.sale_end ?? null, d.wholesale_price_cents ?? null,
         d.wholesale_only ?? false]
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

// ── Discount Rules CRUD ─────────────────────────────────────────────────────

const discountRuleSchema = z.object({
  name:       z.string().min(1).max(100),
  type:       z.enum(['percentage', 'fixed', 'bogo']),
  value:      z.number().min(0),
  min_qty:    z.number().int().min(1).default(1),
  category:   z.string().max(100).nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  is_active:  z.boolean().default(true),
  starts_at:  z.string().datetime().nullable().optional(),
  ends_at:    z.string().datetime().nullable().optional(),
});

// GET /api/products/discount-rules — list discount rules
productsRouter.get('/discount-rules', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM discount_rules ORDER BY created_at DESC'
      );
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[discount-rules] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/discount-rules — create
productsRouter.post('/discount-rules', requireRole('operator'), async (req, res) => {
  const parse = discountRuleSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO discount_rules
           (name, type, value, min_qty, category, product_id, is_active, starts_at, ends_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [d.name, d.type, d.value, d.min_qty, d.category ?? null,
         d.product_id ?? null, d.is_active, d.starts_at ?? null, d.ends_at ?? null]
      );
      res.status(201).json({ data: rows[0] });
      logAuditEvent({ req, action: 'discount_rule.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { rule_id: rows[0].id } });
    });
  } catch (err) {
    console.error('[discount-rules] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/discount-rules/:id — update
productsRouter.patch('/discount-rules/:id', requireRole('operator'), async (req, res) => {
  const parse = discountRuleSchema.partial().safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  const updates = parse.data;
  const fields = Object.keys(updates) as Array<keyof typeof updates>;
  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => updates[f]);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE discount_rules SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Discount rule not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[discount-rules] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/discount-rules/:id
productsRouter.delete('/discount-rules/:id', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query(
        'DELETE FROM discount_rules WHERE id = $1',
        [req.params.id]
      );
      if (!rowCount) { res.status(404).json({ error: 'Discount rule not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[discount-rules] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Customer Groups CRUD ────────────────────────────────────────────────────

const customerGroupSchema = z.object({
  name:         z.string().min(1).max(100),
  slug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  discount_pct: z.number().min(0).max(100).default(0),
  is_default:   z.boolean().default(false),
});

// GET /api/products/customer-groups
productsRouter.get('/customer-groups', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM customer_groups ORDER BY name ASC');
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[customer-groups] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/customer-groups
productsRouter.post('/customer-groups', requireRole('tenant_admin'), async (req, res) => {
  const parse = customerGroupSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO customer_groups (name, slug, discount_pct, is_default)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [d.name, d.slug, d.discount_pct, d.is_default]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Group slug already exists' });
      return;
    }
    console.error('[customer-groups] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/customer-groups/:id
productsRouter.patch('/customer-groups/:id', requireRole('tenant_admin'), async (req, res) => {
  const parse = customerGroupSchema.partial().safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  const updates = parse.data;
  const fields = Object.keys(updates) as Array<keyof typeof updates>;
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => updates[f]);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE customer_groups SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Customer group not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[customer-groups] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/customer-groups/:id
productsRouter.delete('/customer-groups/:id', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query(
        'DELETE FROM customer_groups WHERE id = $1 AND is_default = false',
        [req.params.id]
      );
      if (!rowCount) { res.status(400).json({ error: 'Cannot delete default group or group not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[customer-groups] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Product Attributes CRUD ────────────────────────────────────────────────

const attributeSchema = z.object({
  name:     z.string().min(1).max(100),
  slug:     z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/),
  type:     z.enum(['select', 'color', 'size']).default('select'),
  values:   z.array(z.string().max(100)).default([]),
  position: z.number().int().min(0).default(0),
});

productsRouter.get('/attributes', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM product_attributes ORDER BY position ASC, name ASC');
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[attributes] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

productsRouter.post('/attributes', requireRole('operator'), async (req, res) => {
  const parse = attributeSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO product_attributes (name, slug, type, values, position)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [d.name, d.slug, d.type, JSON.stringify(d.values), d.position]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') { res.status(409).json({ error: 'Attribute slug already exists' }); return; }
    console.error('[attributes] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

productsRouter.patch('/attributes/:attrId', requireRole('operator'), async (req, res) => {
  const parse = attributeSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const updates = parse.data;
  const fields = Object.keys(updates) as Array<keyof typeof updates>;
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${f === 'values' ? '"values"' : f} = $${i + 2}`).join(', ');
  const values = fields.map(f => f === 'values' ? JSON.stringify(updates[f]) : updates[f]);
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE product_attributes SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.attrId, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Attribute not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[attributes] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

productsRouter.delete('/attributes/:attrId', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM product_attributes WHERE id = $1', [req.params.attrId]);
      if (!rowCount) { res.status(404).json({ error: 'Attribute not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[attributes] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Shipping Zones & Methods CRUD ────────────────────────────────────────

const shippingZoneSchema = z.object({
  name:         z.string().min(1).max(100),
  countries:    z.array(z.string().length(2)).default(['US']),
  states:       z.array(z.string().max(10)).default([]),
  zip_patterns: z.array(z.string().max(20)).default([]),
  priority:     z.number().int().min(0).default(0),
  is_active:    z.boolean().default(true),
});

const shippingMethodSchema = z.object({
  zone_id:              z.string().uuid(),
  type:                 z.enum(['flat_rate', 'free_shipping', 'local_pickup', 'weight_based']),
  title:                z.string().min(1).max(100).default('Shipping'),
  cost_cents:           z.number().int().min(0).default(0),
  free_above_cents:     z.number().int().min(0).nullable().optional(),
  per_item_cents:       z.number().int().min(0).default(0),
  weight_rate_cents_per_oz: z.number().int().min(0).default(0),
  is_active:            z.boolean().default(true),
  position:             z.number().int().min(0).default(0),
});

// GET /api/products/shipping-zones
productsRouter.get('/shipping-zones', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: zones } = await db.query('SELECT * FROM shipping_zones ORDER BY priority ASC, name ASC');
      const { rows: methods } = await db.query('SELECT * FROM shipping_methods ORDER BY position ASC');
      const zonesWithMethods = zones.map((z: any) => ({
        ...z,
        methods: methods.filter((m: any) => m.zone_id === z.id),
      }));
      res.json({ data: zonesWithMethods });
    });
  } catch (err) {
    console.error('[shipping-zones] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/shipping-zones
productsRouter.post('/shipping-zones', requireRole('tenant_admin'), async (req, res) => {
  const parse = shippingZoneSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO shipping_zones (name, countries, states, zip_patterns, priority, is_active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.name, JSON.stringify(d.countries), JSON.stringify(d.states), JSON.stringify(d.zip_patterns), d.priority, d.is_active]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[shipping-zones] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/shipping-zones/:zoneId
productsRouter.delete('/shipping-zones/:zoneId', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM shipping_zones WHERE id = $1', [req.params.zoneId]);
      if (!rowCount) { res.status(404).json({ error: 'Shipping zone not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[shipping-zones] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/shipping-methods
productsRouter.post('/shipping-methods', requireRole('tenant_admin'), async (req, res) => {
  const parse = shippingMethodSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO shipping_methods (zone_id, type, title, cost_cents, free_above_cents, per_item_cents, weight_rate_cents_per_oz, is_active, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [d.zone_id, d.type, d.title, d.cost_cents, d.free_above_cents ?? null, d.per_item_cents, d.weight_rate_cents_per_oz, d.is_active, d.position]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[shipping-methods] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/shipping-methods/:methodId
productsRouter.delete('/shipping-methods/:methodId', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM shipping_methods WHERE id = $1', [req.params.methodId]);
      if (!rowCount) { res.status(404).json({ error: 'Shipping method not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[shipping-methods] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Tax Zones & Rates CRUD ───────────────────────────────────────────────

const taxZoneSchema = z.object({
  name:        z.string().min(1).max(100),
  country:     z.string().length(2).default('US'),
  state:       z.string().max(10).nullable().optional(),
  zip_pattern: z.string().max(20).nullable().optional(),
  priority:    z.number().int().min(0).default(0),
  is_active:   z.boolean().default(true),
});

const taxRateSchema = z.object({
  zone_id:     z.string().uuid(),
  tax_class:   z.enum(['standard', 'reduced', 'zero']).default('standard'),
  rate_pct:    z.number().min(0).max(100),
  name:        z.string().min(1).max(100).default('Tax'),
  is_compound: z.boolean().default(false),
  is_shipping: z.boolean().default(false),
});

// GET /api/products/tax-zones
productsRouter.get('/tax-zones', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: zones } = await db.query('SELECT * FROM tax_zones ORDER BY priority ASC, name ASC');
      const { rows: rates } = await db.query('SELECT * FROM tax_rates ORDER BY created_at ASC');
      // Nest rates under their zones
      const zonesWithRates = zones.map((z: any) => ({
        ...z,
        rates: rates.filter((r: any) => r.zone_id === z.id),
      }));
      res.json({ data: zonesWithRates });
    });
  } catch (err) {
    console.error('[tax-zones] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/tax-zones
productsRouter.post('/tax-zones', requireRole('tenant_admin'), async (req, res) => {
  const parse = taxZoneSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO tax_zones (name, country, state, zip_pattern, priority, is_active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.name, d.country, d.state ?? null, d.zip_pattern ?? null, d.priority, d.is_active]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[tax-zones] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/tax-zones/:zoneId
productsRouter.patch('/tax-zones/:zoneId', requireRole('tenant_admin'), async (req, res) => {
  const parse = taxZoneSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const updates = parse.data;
  const fields = Object.keys(updates) as Array<keyof typeof updates>;
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => updates[f]);
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE tax_zones SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.zoneId, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Tax zone not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[tax-zones] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/tax-zones/:zoneId
productsRouter.delete('/tax-zones/:zoneId', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM tax_zones WHERE id = $1', [req.params.zoneId]);
      if (!rowCount) { res.status(404).json({ error: 'Tax zone not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[tax-zones] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/tax-rates
productsRouter.post('/tax-rates', requireRole('tenant_admin'), async (req, res) => {
  const parse = taxRateSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO tax_rates (zone_id, tax_class, rate_pct, name, is_compound, is_shipping)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [d.zone_id, d.tax_class, d.rate_pct, d.name, d.is_compound, d.is_shipping]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[tax-rates] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/tax-rates/:rateId
productsRouter.delete('/tax-rates/:rateId', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM tax_rates WHERE id = $1', [req.params.rateId]);
      if (!rowCount) { res.status(404).json({ error: 'Tax rate not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[tax-rates] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Coupons CRUD ─────────────────────────────────────────────────────────

const couponSchema = z.object({
  code:               z.string().min(1).max(50).transform(s => s.toUpperCase().trim()),
  type:               z.enum(['percentage', 'fixed', 'free_shipping']),
  value:              z.number().min(0).default(0),
  min_order_cents:    z.number().int().min(0).default(0),
  max_uses:           z.number().int().min(1).nullable().optional(),
  per_customer_limit: z.number().int().min(1).nullable().optional(),
  applies_to:         z.enum(['all', 'categories', 'products']).default('all'),
  product_ids:        z.array(z.string().uuid()).default([]),
  category_names:     z.array(z.string().max(100)).default([]),
  starts_at:          z.string().datetime().nullable().optional(),
  expires_at:         z.string().datetime().nullable().optional(),
  is_active:          z.boolean().default(true),
});

// GET /api/products/coupons — list all coupons
productsRouter.get('/coupons', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[coupons] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/coupons — create coupon
productsRouter.post('/coupons', requireRole('operator'), async (req, res) => {
  const parse = couponSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO coupons (code, type, value, min_order_cents, max_uses, per_customer_limit,
          applies_to, product_ids, category_names, starts_at, expires_at, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [d.code, d.type, d.value, d.min_order_cents, d.max_uses ?? null, d.per_customer_limit ?? null,
         d.applies_to, JSON.stringify(d.product_ids), JSON.stringify(d.category_names),
         d.starts_at ?? null, d.expires_at ?? null, d.is_active]
      );
      res.status(201).json({ data: rows[0] });
      logAuditEvent({ req, action: 'coupon.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { coupon_id: rows[0].id, code: d.code } });
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') { res.status(409).json({ error: 'Coupon code already exists' }); return; }
    console.error('[coupons] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/coupons/:id — update coupon
productsRouter.patch('/coupons/:couponId', requireRole('operator'), async (req, res) => {
  const parse = couponSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const updates = parse.data;
  const fields = Object.keys(updates) as Array<keyof typeof updates>;
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const values = fields.map(f => {
    const val = updates[f];
    if (f === 'product_ids' || f === 'category_names') return JSON.stringify(val);
    return val;
  });

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE coupons SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.couponId, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Coupon not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[coupons] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/coupons/:couponId
productsRouter.delete('/coupons/:couponId', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM coupons WHERE id = $1', [req.params.couponId]);
      if (!rowCount) { res.status(404).json({ error: 'Coupon not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    console.error('[coupons] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Product Images CRUD ──────────────────────────────────────────────────

const imageSchema = z.object({
  url:        z.string().url(),
  cdn_key:    z.string().max(500).nullable().optional(),
  alt_text:   z.string().max(255).default(''),
  variant_id: z.string().uuid().nullable().optional(),
  position:   z.number().int().min(0).default(0),
  is_primary: z.boolean().default(false),
});

// GET /api/products/:id/images
productsRouter.get('/:id/images', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM product_images WHERE product_id = $1 ORDER BY position ASC, created_at ASC',
        [req.params.id]
      );
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[images] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/:id/images
productsRouter.post('/:id/images', requireRole('operator'), async (req, res) => {
  const parse = imageSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: pRows } = await db.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
      if (!pRows[0]) { res.status(404).json({ error: 'Product not found' }); return; }

      // If this is marked primary, clear other primaries for this product
      if (d.is_primary) {
        await db.query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [req.params.id]);
      }

      // Auto-set first image as primary
      const { rows: countRows } = await db.query(
        'SELECT COUNT(*)::int AS cnt FROM product_images WHERE product_id = $1',
        [req.params.id]
      );
      const isFirst = countRows[0]?.cnt === 0;

      const { rows } = await db.query(
        `INSERT INTO product_images (product_id, variant_id, url, cdn_key, alt_text, position, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.params.id, d.variant_id ?? null, d.url, d.cdn_key ?? null, d.alt_text, d.position, d.is_primary || isFirst]
      );

      // Sync primary image_url on the product for backwards compatibility
      if (d.is_primary || isFirst) {
        await db.query('UPDATE products SET image_url = $1, updated_at = now() WHERE id = $2', [d.url, req.params.id]);
      }

      res.status(201).json({ data: rows[0] });
      logAuditEvent({ req, action: 'product_image.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: req.params.id, image_id: rows[0].id } });
    });
  } catch (err) {
    console.error('[images] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/:id/images/:imageId — update position, alt_text, is_primary
productsRouter.patch('/:id/images/:imageId', requireRole('operator'), async (req, res) => {
  const parse = imageSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const updates = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      // If setting as primary, clear others first
      if (updates.is_primary) {
        await db.query('UPDATE product_images SET is_primary = false WHERE product_id = $1', [req.params.id]);
      }

      const fields = Object.keys(updates) as Array<keyof typeof updates>;
      if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
      const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
      const values = fields.map(f => updates[f]);

      const { rows } = await db.query(
        `UPDATE product_images SET ${setClauses} WHERE id = $1 AND product_id = $2 RETURNING *`,
        [req.params.imageId, req.params.id, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Image not found' }); return; }

      // Sync primary image_url on the product
      if (updates.is_primary) {
        await db.query('UPDATE products SET image_url = $1, updated_at = now() WHERE id = $2', [rows[0].url, req.params.id]);
      }

      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[images] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/:id/images/:imageId
productsRouter.delete('/:id/images/:imageId', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING is_primary, url',
        [req.params.imageId, req.params.id]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Image not found' }); return; }

      // If we deleted the primary, promote the next image
      if (rows[0].is_primary) {
        const { rows: nextRows } = await db.query(
          'UPDATE product_images SET is_primary = true WHERE product_id = $1 ORDER BY position ASC LIMIT 1 RETURNING url',
          [req.params.id]
        );
        const newPrimaryUrl = nextRows[0]?.url ?? null;
        await db.query('UPDATE products SET image_url = $1, updated_at = now() WHERE id = $2', [newPrimaryUrl, req.params.id]);
      }

      res.status(204).send();
      logAuditEvent({ req, action: 'product_image.deleted', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: req.params.id, image_id: req.params.imageId } });
    });
  } catch (err) {
    console.error('[images] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Product Variants CRUD ─────────────────────────────────────────────────

const variantSchema = z.object({
  sku:              z.string().max(100).nullable().optional(),
  price_cents:      z.number().int().min(0).nullable().optional(),
  sale_price_cents: z.number().int().min(0).nullable().optional(),
  stock:            z.number().int().min(0).default(0),
  weight_oz:        z.number().min(0).nullable().optional(),
  length_in:        z.number().min(0).nullable().optional(),
  width_in:         z.number().min(0).nullable().optional(),
  height_in:        z.number().min(0).nullable().optional(),
  attributes:       z.record(z.string()).default({}),
  image_url:        z.string().url().nullable().optional(),
  is_active:        z.boolean().default(true),
  position:         z.number().int().min(0).default(0),
});

// GET /api/products/:id/variants
productsRouter.get('/:id/variants', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY position ASC, created_at ASC',
        [req.params.id]
      );
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[variants] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/:id/variants
productsRouter.post('/:id/variants', requireRole('operator'), async (req, res) => {
  const parse = variantSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      // Verify product exists
      const { rows: pRows } = await db.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
      if (!pRows[0]) { res.status(404).json({ error: 'Product not found' }); return; }

      // Auto-set product_type to 'variable'
      await db.query("UPDATE products SET product_type = 'variable', updated_at = now() WHERE id = $1", [req.params.id]);

      const { rows } = await db.query(
        `INSERT INTO product_variants
           (product_id, sku, price_cents, sale_price_cents, stock, weight_oz,
            length_in, width_in, height_in, attributes, image_url, is_active, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [req.params.id, d.sku ?? null, d.price_cents ?? null, d.sale_price_cents ?? null,
         d.stock, d.weight_oz ?? null, d.length_in ?? null, d.width_in ?? null, d.height_in ?? null,
         JSON.stringify(d.attributes), d.image_url ?? null, d.is_active, d.position]
      );
      res.status(201).json({ data: rows[0] });
      logAuditEvent({ req, action: 'variant.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { product_id: req.params.id, variant_id: rows[0].id } });
    });
  } catch (err) {
    console.error('[variants] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/:id/variants/:variantId
productsRouter.patch('/:id/variants/:variantId', requireRole('operator'), async (req, res) => {
  const parse = variantSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }
  const updates = parse.data;
  const fields = Object.keys(updates) as Array<keyof typeof updates>;
  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  const setClauses = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const values = fields.map(f => f === 'attributes' ? JSON.stringify(updates[f]) : updates[f]);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE product_variants SET ${setClauses}, updated_at = now()
         WHERE id = $1 AND product_id = $2 RETURNING *`,
        [req.params.variantId, req.params.id, ...values]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Variant not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[variants] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/:id/variants/:variantId
productsRouter.delete('/:id/variants/:variantId', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query(
        'DELETE FROM product_variants WHERE id = $1 AND product_id = $2',
        [req.params.variantId, req.params.id]
      );
      if (!rowCount) { res.status(404).json({ error: 'Variant not found' }); return; }

      // If no variants remain, revert to simple product
      const { rows: remaining } = await db.query(
        'SELECT COUNT(*)::int AS cnt FROM product_variants WHERE product_id = $1',
        [req.params.id]
      );
      if (remaining[0]?.cnt === 0) {
        await db.query("UPDATE products SET product_type = 'simple', updated_at = now() WHERE id = $1", [req.params.id]);
      }

      res.status(204).send();
    });
  } catch (err) {
    console.error('[variants] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/:id — MUST be after named sub-routes (discount-rules, customer-groups, attributes, variants)
productsRouter.get('/:id', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM products WHERE id = $1',
        [req.params.id]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Product not found' }); return; }

      // Include variants if it's a variable product
      let variants: unknown[] = [];
      if (rows[0].product_type === 'variable') {
        const vResult = await db.query(
          'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY position ASC, created_at ASC',
          [req.params.id]
        );
        variants = vResult.rows;
      }

      // Include images
      const { rows: images } = await db.query(
        'SELECT * FROM product_images WHERE product_id = $1 ORDER BY position ASC, created_at ASC',
        [req.params.id]
      );

      res.json({ data: { ...rows[0], variants, images } });
    });
  } catch (err) {
    console.error('[products] Get error:', err);
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

// ── Product Reviews (Admin) ──────────────────────────────────────────────────

// GET /api/products/reviews — list all reviews (admin), optionally filter by status
productsRouter.get('/reviews', requireRole('operator'), async (req, res) => {
  const { status, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const params: unknown[] = [parseInt(limit as string), offset];
      const where = status ? `WHERE r.status = $${params.push(status)}` : '';

      const { rows } = await db.query(
        `SELECT r.*, p.name AS product_name, COUNT(*) OVER() AS total_count
         FROM product_reviews r
         JOIN products p ON p.id = r.product_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      );

      const total = rows[0]?.total_count ?? 0;
      res.json({
        data: rows,
        meta: { page: parseInt(page as string), limit: parseInt(limit as string), total: parseInt(total) },
      });
    });
  } catch (err) {
    console.error('[reviews] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/reviews/:reviewId — moderate review (approve/reject)
productsRouter.patch('/reviews/:reviewId', requireRole('operator'), async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status || !['approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'status must be "approved" or "rejected"' });
    return;
  }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [review] } = await db.query(
        `UPDATE product_reviews SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.reviewId, status]
      );
      if (!review) { res.status(404).json({ error: 'Review not found' }); return; }

      // Recalculate aggregate on the product
      await db.query(
        `UPDATE products SET
           review_count = (SELECT COUNT(*) FROM product_reviews WHERE product_id = $1 AND status = 'approved'),
           avg_rating   = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM product_reviews WHERE product_id = $1 AND status = 'approved'), 0)
         WHERE id = $1`,
        [review.product_id]
      );

      res.json({ data: review });
    });
  } catch (err) {
    console.error('[reviews] Moderate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/reviews/:reviewId — delete review
productsRouter.delete('/reviews/:reviewId', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [review] } = await db.query(
        'DELETE FROM product_reviews WHERE id = $1 RETURNING product_id',
        [req.params.reviewId]
      );
      if (!review) { res.status(404).json({ error: 'Review not found' }); return; }

      // Recalculate aggregate
      await db.query(
        `UPDATE products SET
           review_count = (SELECT COUNT(*) FROM product_reviews WHERE product_id = $1 AND status = 'approved'),
           avg_rating   = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM product_reviews WHERE product_id = $1 AND status = 'approved'), 0)
         WHERE id = $1`,
        [review.product_id]
      );

      res.json({ success: true });
    });
  } catch (err) {
    console.error('[reviews] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Stock Movements ──────────────────────────────────────────────────────────

const stockAdjustmentSchema = z.object({
  qty_change:   z.number().int(),
  reason:       z.enum(['sale', 'return', 'adjustment', 'transfer', 'restock']),
  reference_id: z.string().optional(),
  notes:        z.string().max(500).optional(),
  variant_id:   z.string().uuid().optional(),
});

// POST /api/products/:id/stock — adjust stock and record movement
productsRouter.post('/:id/stock', requireRole('operator'), async (req, res) => {
  const parse = stockAdjustmentSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { qty_change, reason, reference_id, notes, variant_id } = parse.data;

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      // Update product stock
      if (variant_id) {
        const { rows: [v] } = await db.query(
          'UPDATE product_variants SET stock = stock + $2 WHERE id = $1 AND product_id = $3 RETURNING stock',
          [variant_id, qty_change, req.params.id]
        );
        if (!v) { res.status(404).json({ error: 'Variant not found' }); return; }
      } else {
        const { rows: [p] } = await db.query(
          'UPDATE products SET stock_qty = stock_qty + $2, updated_at = now() WHERE id = $1 RETURNING stock_qty',
          [req.params.id, qty_change]
        );
        if (!p) { res.status(404).json({ error: 'Product not found' }); return; }
      }

      // Record movement
      const { rows: [movement] } = await db.query(
        `INSERT INTO stock_movements (product_id, variant_id, qty_change, reason, reference_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.params.id, variant_id ?? null, qty_change, reason, reference_id ?? null, notes ?? null, req.user!.userId]
      );

      res.status(201).json({ data: movement });

      logAuditEvent({
        req, action: 'stock.adjusted', tenantId: req.user!.tenantId, userId: req.user!.userId,
        metadata: { product_id: req.params.id, qty_change, reason },
      });
    });
  } catch (err) {
    console.error('[products] Stock adjustment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/:id/stock-history — get stock movement history
productsRouter.get('/:id/stock-history', requireRole('operator'), async (req, res) => {
  const { page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT sm.*, COUNT(*) OVER() AS total_count
         FROM stock_movements sm
         WHERE sm.product_id = $1
         ORDER BY sm.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.params.id, parseInt(limit as string), offset]
      );

      const total = rows[0]?.total_count ?? 0;
      res.json({
        data: rows,
        meta: { page: parseInt(page as string), limit: parseInt(limit as string), total: parseInt(total) },
      });
    });
  } catch (err) {
    console.error('[products] Stock history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Abandoned Carts (Admin) ──────────────────────────────────────────────────

// GET /api/products/abandoned-carts — list abandoned carts
productsRouter.get('/abandoned-carts', requireRole('operator'), async (req, res) => {
  const { page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT *, COUNT(*) OVER() AS total_count
         FROM abandoned_carts
         WHERE recovered_at IS NULL
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit as string), offset]
      );

      const total = rows[0]?.total_count ?? 0;
      res.json({
        data: rows,
        meta: { page: parseInt(page as string), limit: parseInt(limit as string), total: parseInt(total) },
      });
    });
  } catch (err) {
    console.error('[products] Abandoned carts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Pages / CMS (Admin) ─────────────────────────────────────────────────────

const pageSchema = z.object({
  slug:            z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title:           z.string().min(1).max(255),
  body:            z.string().default(''),
  seo_title:       z.string().max(255).optional(),
  seo_description: z.string().max(500).optional(),
  is_published:    z.boolean().default(false),
  position:        z.number().int().min(0).default(0),
});

// GET /api/products/pages — list all pages
productsRouter.get('/pages', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM pages ORDER BY position ASC, created_at DESC');
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[pages] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/pages — create page
productsRouter.post('/pages', requireRole('operator'), async (req, res) => {
  const parse = pageSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const d = parse.data;
      const { rows: [page] } = await db.query(
        `INSERT INTO pages (slug, title, body, seo_title, seo_description, is_published, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [d.slug, d.title, d.body, d.seo_title ?? null, d.seo_description ?? null, d.is_published, d.position]
      );
      res.status(201).json({ data: page });
    });
  } catch (err) {
    console.error('[pages] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/pages/:id — update page
productsRouter.patch('/pages/:id', requireRole('operator'), async (req, res) => {
  const parse = pageSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed' }); return; }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const sets: string[] = ['updated_at = now()'];
      const params: unknown[] = [req.params.id];
      for (const [key, val] of Object.entries(parse.data)) {
        params.push(val ?? null);
        sets.push(`${key} = $${params.length}`);
      }
      const { rows: [page] } = await db.query(
        `UPDATE pages SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params
      );
      if (!page) { res.status(404).json({ error: 'Page not found' }); return; }
      res.json({ data: page });
    });
  } catch (err) {
    console.error('[pages] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/pages/:id — delete page
productsRouter.delete('/pages/:id', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM pages WHERE id = $1', [req.params.id]);
      if (!rowCount) { res.status(404).json({ error: 'Page not found' }); return; }
      res.json({ success: true });
    });
  } catch (err) {
    console.error('[pages] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Navigation Menus (Admin) ─────────────────────────────────────────────────

// GET /api/products/nav-menus — list all nav menus
productsRouter.get('/nav-menus', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM nav_menus ORDER BY location');
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[nav-menus] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/products/nav-menus/:location — update menu items for location
productsRouter.put('/nav-menus/:location', requireRole('operator'), async (req, res) => {
  const location = req.params.location;
  if (!['header', 'footer'].includes(location)) {
    res.status(400).json({ error: 'Location must be "header" or "footer"' }); return;
  }
  const { items } = req.body as { items?: unknown[] };
  if (!Array.isArray(items)) { res.status(400).json({ error: 'items array required' }); return; }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [menu] } = await db.query(
        `UPDATE nav_menus SET items = $2, updated_at = now() WHERE location = $1 RETURNING *`,
        [location, JSON.stringify(items)]
      );
      if (!menu) { res.status(404).json({ error: 'Menu not found' }); return; }
      res.json({ data: menu });
    });
  } catch (err) {
    console.error('[nav-menus] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Blog Posts (Admin) ───────────────────────────────────────────────────────

const blogPostSchema = z.object({
  slug:           z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  title:          z.string().min(1).max(255),
  body:           z.string().default(''),
  excerpt:        z.string().max(500).optional(),
  featured_image: z.string().url().optional(),
  status:         z.enum(['draft', 'published']).default('draft'),
  tags:           z.array(z.string()).default([]),
});

// GET /api/products/blog-posts
productsRouter.get('/blog-posts', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM blog_posts ORDER BY created_at DESC');
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[blog] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/products/blog-posts
productsRouter.post('/blog-posts', requireRole('operator'), async (req, res) => {
  const parse = blogPostSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() }); return; }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const d = parse.data;
      const publishedAt = d.status === 'published' ? new Date().toISOString() : null;
      const { rows: [post] } = await db.query(
        `INSERT INTO blog_posts (slug, title, body, excerpt, featured_image, status, published_at, tags, author_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [d.slug, d.title, d.body, d.excerpt ?? null, d.featured_image ?? null,
         d.status, publishedAt, JSON.stringify(d.tags), req.user!.userId]
      );
      res.status(201).json({ data: post });
    });
  } catch (err) {
    console.error('[blog] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/products/blog-posts/:id
productsRouter.patch('/blog-posts/:id', requireRole('operator'), async (req, res) => {
  const parse = blogPostSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Validation failed' }); return; }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const sets: string[] = ['updated_at = now()'];
      const params: unknown[] = [req.params.id];
      for (const [key, val] of Object.entries(parse.data)) {
        if (key === 'tags') {
          params.push(JSON.stringify(val));
        } else {
          params.push(val ?? null);
        }
        sets.push(`${key} = $${params.length}`);
      }
      // Auto-set published_at when publishing
      if (parse.data.status === 'published') {
        params.push(new Date().toISOString());
        sets.push(`published_at = COALESCE(published_at, $${params.length}::timestamptz)`);
      }
      const { rows: [post] } = await db.query(
        `UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params
      );
      if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
      res.json({ data: post });
    });
  } catch (err) {
    console.error('[blog] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/products/blog-posts/:id
productsRouter.delete('/blog-posts/:id', requireRole('operator'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM blog_posts WHERE id = $1', [req.params.id]);
      if (!rowCount) { res.status(404).json({ error: 'Post not found' }); return; }
      res.json({ success: true });
    });
  } catch (err) {
    console.error('[blog] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
