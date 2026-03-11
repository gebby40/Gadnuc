import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';
import { provisionTenantSchema, dropTenantSchema } from '@gadnuc/db';

export const tenantsRouter = Router();
tenantsRouter.use(requireAuth, requireRole('super_admin'));

const createTenantSchema = z.object({
  slug:         z.string().min(2).max(63).regex(/^[a-z0-9_]+$/),
  display_name: z.string().min(1).max(255),
  plan_name:    z.enum(['starter', 'professional', 'enterprise']).default('starter'),
});

const updateTenantSchema = z.object({
  display_name:  z.string().min(1).max(255).optional(),
  custom_domain: z.string().max(255).nullable().optional(),
  status:        z.enum(['trialing','active','past_due','suspended','cancelled']).optional(),
});

// GET /api/tenants
tenantsRouter.get('/', async (_req, res) => {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.name AS plan_name, p.price_cents
       FROM public.tenants t
       JOIN public.plans p ON t.plan_id = p.id
       ORDER BY t.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[tenants] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tenants/:id
tenantsRouter.get('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.name AS plan_name FROM public.tenants t
       JOIN public.plans p ON t.plan_id = p.id WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: 'Tenant not found' }); return; }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tenants — create + provision a new tenant
tenantsRouter.post('/', async (req, res) => {
  const parse = createTenantSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { slug, display_name, plan_name } = parse.data;
  const pool = getPool();

  try {
    // Look up plan
    const { rows: [plan] } = await pool.query(
      'SELECT id FROM public.plans WHERE name = $1', [plan_name]
    );
    if (!plan) { res.status(400).json({ error: `Plan "${plan_name}" not found` }); return; }

    // Insert tenant record
    const { rows: [tenant] } = await pool.query(
      `INSERT INTO public.tenants (slug, display_name, plan_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [slug, display_name, plan.id]
    );

    // Provision schema (async — runs DB DDL)
    await provisionTenantSchema(pool, slug);

    console.log(`[tenants] Created tenant: ${slug} (${tenant.id})`);
    res.status(201).json({ data: tenant });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Tenant slug already exists' });
      return;
    }
    console.error('[tenants] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tenants/:id
tenantsRouter.patch('/:id', async (req, res) => {
  const parse = updateTenantSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const pool = getPool();
  const fields = Object.keys(parse.data).filter(k => (parse.data as Record<string, unknown>)[k] !== undefined);
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  try {
    const { rows } = await pool.query(
      `UPDATE public.tenants SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => (parse.data as Record<string, unknown>)[f])]
    );
    if (!rows[0]) { res.status(404).json({ error: 'Tenant not found' }); return; }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tenants/:id — GDPR-compliant full wipe
tenantsRouter.delete('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { rows: [tenant] } = await pool.query(
      'SELECT slug FROM public.tenants WHERE id = $1', [req.params.id]
    );
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

    await dropTenantSchema(pool, tenant.slug);
    await pool.query('DELETE FROM public.tenants WHERE id = $1', [req.params.id]);

    console.log(`[tenants] Deleted tenant: ${tenant.slug}`);
    res.status(204).send();
  } catch (err) {
    console.error('[tenants] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Re-export provisionTenantSchema for use by other routes
export { provisionTenantSchema };
