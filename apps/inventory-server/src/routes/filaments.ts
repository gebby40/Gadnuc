import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';

export const filamentsRouter = Router();
filamentsRouter.use(requireAuth);

const filamentSchema = z.object({
  name:          z.string().min(1).max(255),
  brand:         z.string().max(100).optional(),
  material:      z.string().min(1).max(50),
  color:         z.string().max(100).optional(),
  color_hex:     z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  diameter_mm:   z.number().min(1).max(5).default(1.75),
  weight_g:      z.number().int().positive().default(1000),
  remaining_pct: z.number().int().min(0).max(100).default(100),
  price_cents:   z.number().int().min(0).default(0),
  is_active:     z.boolean().default(true),
});

// GET /api/filaments
filamentsRouter.get('/', async (req, res) => {
  const { material, active } = req.query;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const params: unknown[] = [];
      const conds: string[] = ['1=1'];
      if (material) { params.push(material); conds.push(`material = $${params.length}`); }
      if (active !== undefined) { params.push(active === 'true'); conds.push(`is_active = $${params.length}`); }

      const { rows } = await db.query(
        `SELECT * FROM filaments WHERE ${conds.join(' AND ')} ORDER BY name`, params
      );
      res.json({ data: rows });
    });
  } catch (err) {
    console.error('[filaments] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/filaments/:id
filamentsRouter.get('/:id', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query('SELECT * FROM filaments WHERE id = $1', [req.params.id]);
      if (!rows[0]) { res.status(404).json({ error: 'Filament not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/filaments
filamentsRouter.post('/', requireRole('operator'), async (req, res) => {
  const parse = filamentSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  const d = parse.data;
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO filaments
           (name, brand, material, color, color_hex, diameter_mm, weight_g,
            remaining_pct, price_cents, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [d.name, d.brand ?? null, d.material, d.color ?? null,
         d.color_hex ?? null, d.diameter_mm, d.weight_g,
         d.remaining_pct, d.price_cents, d.is_active]
      );
      res.status(201).json({ data: rows[0] });
    });
  } catch (err) {
    console.error('[filaments] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/filaments/:id
filamentsRouter.patch('/:id', requireRole('operator'), async (req, res) => {
  const parse = filamentSchema.partial().safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  const fields = Object.keys(parse.data) as Array<keyof typeof parse.data>;
  if (!fields.length) { res.status(400).json({ error: 'No fields provided' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE filaments SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, ...fields.map(f => parse.data[f])]
      );
      if (!rows[0]) { res.status(404).json({ error: 'Filament not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/filaments/:id
filamentsRouter.delete('/:id', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rowCount } = await db.query('DELETE FROM filaments WHERE id = $1', [req.params.id]);
      if (!rowCount) { res.status(404).json({ error: 'Filament not found' }); return; }
      res.status(204).send();
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
