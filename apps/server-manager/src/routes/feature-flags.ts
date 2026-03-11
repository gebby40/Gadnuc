import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';
import { invalidateFlagCache } from '@gadnuc/feature-flags';

export const featureFlagsRouter = Router();
featureFlagsRouter.use(requireAuth, requireRole('super_admin'));

const flagSchema = z.object({
  flag_name:   z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
  tenant_id:   z.string().uuid().nullable().default(null),
  enabled:     z.boolean(),
  rollout_pct: z.number().int().min(0).max(100).default(100),
});

// GET /api/feature-flags
featureFlagsRouter.get('/', async (req, res) => {
  const { tenant_id } = req.query;
  const pool = getPool();
  try {
    const params: unknown[] = [];
    const where = tenant_id
      ? `WHERE ff.tenant_id = $${params.push(tenant_id)}`
      : '';

    const { rows } = await pool.query(
      `SELECT ff.*, t.slug AS tenant_slug
       FROM public.feature_flags ff
       LEFT JOIN public.tenants t ON ff.tenant_id = t.id
       ${where}
       ORDER BY ff.flag_name, ff.tenant_id NULLS FIRST`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/feature-flags — upsert a flag
featureFlagsRouter.put('/', async (req, res) => {
  const parse = flagSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { flag_name, tenant_id, enabled, rollout_pct } = parse.data;
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `INSERT INTO public.feature_flags (flag_name, tenant_id, enabled, rollout_pct)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (flag_name, tenant_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             rollout_pct = EXCLUDED.rollout_pct,
             updated_at = now()
       RETURNING *`,
      [flag_name, tenant_id, enabled, rollout_pct]
    );

    // Invalidate cache so change takes effect immediately
    invalidateFlagCache(flag_name, tenant_id ?? undefined);

    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/feature-flags/:id
featureFlagsRouter.delete('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { rows: [flag] } = await pool.query(
      'SELECT flag_name, tenant_id FROM public.feature_flags WHERE id = $1', [req.params.id]
    );
    if (!flag) { res.status(404).json({ error: 'Flag not found' }); return; }

    await pool.query('DELETE FROM public.feature_flags WHERE id = $1', [req.params.id]);
    invalidateFlagCache(flag.flag_name, flag.tenant_id ?? undefined);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
