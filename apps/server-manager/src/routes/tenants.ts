import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool, purgeAllTenantData, provisionTenantSchema, withTenantSchema } from '@gadnuc/db';
import { invalidateTenantCache } from '@gadnuc/tenant';

export const tenantsRouter = Router();
tenantsRouter.use(requireAuth, requireRole('super_admin'));

// ── Validation schemas ────────────────────────────────────────────────────────

const createTenantSchema = z.object({
  slug:         z.string().min(2).max(63).regex(/^[a-z0-9_]+$/),
  display_name: z.string().min(1).max(255),
  plan_name:    z.enum(['starter', 'professional', 'enterprise']).default('starter'),
});

const updateTenantSchema = z.object({
  display_name:  z.string().min(1).max(255).optional(),
  custom_domain: z.string().max(255).nullable().optional(),
  status:        z.enum(['trialing','active','past_due','suspended','cancelled']).optional(),
}).strict();

const suspendSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── GET /api/tenants ──────────────────────────────────────────────────────────

tenantsRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT t.*, p.name AS plan_name, p.price_cents
       FROM public.tenants t
       JOIN public.plans p ON t.plan_id = p.id
       ORDER BY t.created_at DESC`,
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[tenants] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/tenants/:id ──────────────────────────────────────────────────────

tenantsRouter.get('/:id', async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT t.*, p.name AS plan_name FROM public.tenants t
       JOIN public.plans p ON t.plan_id = p.id WHERE t.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Tenant not found' }); return; }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/tenants — create + provision ────────────────────────────────────

tenantsRouter.post('/', async (req, res) => {
  const parse = createTenantSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { slug, display_name, plan_name } = parse.data;
  const pool = getPool();

  // Look up plan
  const { rows: [plan] } = await pool.query(
    'SELECT id FROM public.plans WHERE name = $1', [plan_name],
  );
  if (!plan) { res.status(400).json({ error: `Plan "${plan_name}" not found` }); return; }

  let tenant: { id: string; slug: string } | undefined;
  try {
    // Insert tenant record — provisioning_state starts as 'provisioning'
    const { rows: [row] } = await pool.query(
      `INSERT INTO public.tenants (slug, display_name, plan_id, provisioning_state)
       VALUES ($1, $2, $3, 'provisioning') RETURNING *`,
      [slug, display_name, plan.id],
    );
    tenant = row;

    // Provision schema (with rollback-on-failure built-in)
    await provisionTenantSchema(pool, slug, tenant!.id);

    // Auto-provision #general messaging room (best-effort — don't fail creation)
    try {
      await withTenantSchema(slug, async (db: any) => {
        await db.query(
          `INSERT INTO messaging_rooms (name, topic, room_type, is_public)
           VALUES ('general', 'General team discussion', 'channel', false)
           ON CONFLICT DO NOTHING`,
        );
      });
    } catch {
      // Non-fatal — messaging tables may not exist yet if migration hasn't run
    }

    console.log(`[tenants] Created tenant: ${slug} (${tenant!.id})`);
    res.status(201).json({ data: tenant });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Tenant slug already exists' });
      return;
    }
    // If tenant row was inserted but provisioning failed, mark as failed
    // (provisionTenantSchema already does this, but belt-and-suspenders)
    if (tenant?.id) {
      await pool.query(
        `UPDATE public.tenants SET provisioning_state = 'failed' WHERE id = $1`,
        [tenant.id],
      ).catch(() => {/* ignore */});
    }
    console.error('[tenants] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/tenants/:id ────────────────────────────────────────────────────

tenantsRouter.patch('/:id', async (req, res) => {
  const parse = updateTenantSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const pool   = getPool();
  const data   = parse.data as Record<string, unknown>;
  const fields = Object.keys(data).filter(k => data[k] !== undefined);
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  try {
    const { rows } = await pool.query(
      `UPDATE public.tenants SET ${setClauses}, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...fields.map(f => data[f])],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Tenant not found' }); return; }

    // Invalidate resolver cache after any status/domain change
    invalidateTenantCache(rows[0].slug);

    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/tenants/:id/suspend ─────────────────────────────────────────────

tenantsRouter.post('/:id/suspend', async (req, res) => {
  const parse = suspendSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `UPDATE public.tenants
       SET status = 'suspended', updated_at = now()
       WHERE id = $1 AND status NOT IN ('cancelled')
       RETURNING slug`,
      [req.params.id],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Tenant not found or already cancelled' });
      return;
    }

    invalidateTenantCache(rows[0].slug);
    res.json({ message: 'Tenant suspended', slug: rows[0].slug });
  } catch (err) {
    console.error('[tenants] Suspend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/tenants/:id/unsuspend ──────────────────────────────────────────

tenantsRouter.post('/:id/unsuspend', async (req, res) => {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `UPDATE public.tenants
       SET status = 'active', updated_at = now()
       WHERE id = $1 AND status = 'suspended'
       RETURNING slug`,
      [req.params.id],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Tenant not found or not currently suspended' });
      return;
    }

    invalidateTenantCache(rows[0].slug);
    res.json({ message: 'Tenant unsuspended', slug: rows[0].slug });
  } catch (err) {
    console.error('[tenants] Unsuspend error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/tenants/:id — GDPR-compliant full wipe ───────────────────────

tenantsRouter.delete('/:id', async (req, res) => {
  const pool = getPool();
  try {
    // Record the erasure request before deleting (permanent audit trail)
    const { rows: [existing] } = await pool.query(
      'SELECT slug FROM public.tenants WHERE id = $1',
      [req.params.id],
    );
    if (!existing) { res.status(404).json({ error: 'Tenant not found' }); return; }

    const requestedBy = (req as any).user?.userId ?? 'super_admin';
    await pool.query(
      `INSERT INTO public.deletion_requests
         (tenant_id, tenant_slug, requested_by, reason)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, existing.slug, String(requestedBy), req.body?.reason ?? null],
    );

    // Purge all data (schema + public rows)
    const { slug } = await purgeAllTenantData(pool, req.params.id);

    // Mark deletion request as completed
    await pool.query(
      `UPDATE public.deletion_requests
       SET completed_at = now()
       WHERE tenant_slug = $1 AND completed_at IS NULL`,
      [slug],
    );

    // Flush resolver cache
    invalidateTenantCache(slug);

    // Purge Redis keys for this tenant
    try {
      const { getRedisClient } = await import('@gadnuc/db');
      const redis = getRedisClient();
      const keys  = await redis.keys(`*:${slug}:*`);
      if (keys.length) await redis.del(...keys);
    } catch {/* Redis may not be configured in all envs */}

    console.log(`[tenants] GDPR deletion complete: ${slug}`);
    res.status(204).send();
  } catch (err) {
    console.error('[tenants] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/tenants/:id/reprovision — retry failed provisioning ─────────────

tenantsRouter.post('/:id/reprovision', async (req, res) => {
  const pool = getPool();
  try {
    const { rows: [tenant] } = await pool.query(
      `SELECT id, slug, provisioning_state FROM public.tenants WHERE id = $1`,
      [req.params.id],
    );
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }
    if (tenant.provisioning_state === 'ready') {
      res.status(409).json({ error: 'Tenant is already provisioned' });
      return;
    }

    await provisionTenantSchema(pool, tenant.slug, tenant.id);
    res.json({ message: 'Reprovisioning complete', slug: tenant.slug });
  } catch (err) {
    console.error('[tenants] Reprovision error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
