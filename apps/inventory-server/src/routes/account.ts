import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, hashPassword, verifyPassword } from '@gadnuc/auth';
import { getPool, withTenantSchema, purgeAllTenantData } from '@gadnuc/db';
import { invalidateTenantCache } from '@gadnuc/tenant';
import Stripe from 'stripe';

export const accountRouter = Router();
accountRouter.use(requireAuth);

// ── Stripe client (lazy init) ────────────────────────────────────────────────

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return _stripe;
}

// ── Validation schemas ───────────────────────────────────────────────────────

const updateAccountSchema = z.object({
  display_name: z.string().min(1).max(255),
}).strict();

const changePlanSchema = z.object({
  plan_name: z.enum(['starter', 'professional', 'enterprise']),
}).strict();

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password:     z.string().min(8).max(256),
}).strict();

const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE'),
}).strict();

// ── GET /api/account — tenant info + plan + usage ────────────────────────────

accountRouter.get('/', requireRole('tenant_admin'), async (req, res) => {
  const pool = getPool();
  const slug = req.tenantSlug!;

  try {
    // Tenant + plan info from public schema
    const { rows: [tenant] } = await pool.query(
      `SELECT t.id, t.slug, t.display_name, t.status, t.trial_ends_at, t.created_at,
              t.stripe_customer_id, t.stripe_subscription_id,
              p.name AS plan_name, p.price_cents, p.max_users, p.max_products, p.features
       FROM public.tenants t
       JOIN public.plans p ON t.plan_id = p.id
       WHERE t.slug = $1`,
      [slug],
    );
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

    // Usage counts from tenant schema
    let user_count = 0;
    let product_count = 0;
    await withTenantSchema(slug, async (db) => {
      const uRes = await db.query('SELECT COUNT(*)::int AS count FROM users');
      user_count = uRes.rows[0].count;
      const pRes = await db.query('SELECT COUNT(*)::int AS count FROM products');
      product_count = pRes.rows[0].count;
    });

    res.json({
      data: {
        id:              tenant.id,
        slug:            tenant.slug,
        display_name:    tenant.display_name,
        status:          tenant.status,
        trial_ends_at:   tenant.trial_ends_at,
        created_at:      tenant.created_at,
        plan_name:       tenant.plan_name,
        price_cents:     tenant.price_cents,
        max_users:       tenant.max_users,
        max_products:    tenant.max_products,
        features:        tenant.features,
        user_count,
        product_count,
        has_stripe:      !!tenant.stripe_subscription_id,
      },
    });
  } catch (err) {
    console.error('[account] GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/account — update tenant display name ──────────────────────────

accountRouter.patch('/', requireRole('tenant_admin'), async (req, res) => {
  const parse = updateAccountSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const pool = getPool();
  const slug = req.tenantSlug!;

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE public.tenants SET display_name = $1, updated_at = now()
       WHERE slug = $2 RETURNING display_name`,
      [parse.data.display_name, slug],
    );
    if (!updated) { res.status(404).json({ error: 'Tenant not found' }); return; }

    invalidateTenantCache(slug);
    res.json({ data: updated });
  } catch (err) {
    console.error('[account] PATCH error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/account/plans — list all available plans ────────────────────────

accountRouter.get('/plans', async (_req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, price_cents, max_users, max_products, features
       FROM public.plans ORDER BY price_cents`,
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[account] Plans error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/account/change-plan — switch subscription tier ─────────────────

accountRouter.post('/change-plan', requireRole('tenant_admin'), async (req, res) => {
  const parse = changePlanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const pool = getPool();
  const slug = req.tenantSlug!;

  try {
    const { rows: [plan] } = await pool.query(
      'SELECT id, name FROM public.plans WHERE name = $1',
      [parse.data.plan_name],
    );
    if (!plan) { res.status(400).json({ error: 'Plan not found' }); return; }

    const { rows: [updated] } = await pool.query(
      `UPDATE public.tenants SET plan_id = $1, updated_at = now()
       WHERE slug = $2 RETURNING slug, display_name`,
      [plan.id, slug],
    );
    if (!updated) { res.status(404).json({ error: 'Tenant not found' }); return; }

    invalidateTenantCache(slug);
    console.log(`[account] Plan changed to ${plan.name} for tenant ${slug}`);
    res.json({ data: { plan_name: plan.name } });
  } catch (err) {
    console.error('[account] Change plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/account/cancel — cancel subscription ──────────────────────────

accountRouter.post('/cancel', requireRole('tenant_admin'), async (req, res) => {
  const pool = getPool();
  const slug = req.tenantSlug!;

  try {
    const { rows: [tenant] } = await pool.query(
      `SELECT id, stripe_subscription_id FROM public.tenants WHERE slug = $1`,
      [slug],
    );
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

    // Cancel Stripe subscription if exists
    const stripe = getStripe();
    if (stripe && tenant.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(tenant.stripe_subscription_id);
        console.log(`[account] Cancelled Stripe subscription for ${slug}`);
      } catch (err) {
        console.warn('[account] Stripe cancel failed (non-fatal):', (err as Error).message);
      }
    }

    await pool.query(
      `UPDATE public.tenants SET status = 'cancelled', updated_at = now() WHERE slug = $1`,
      [slug],
    );

    invalidateTenantCache(slug);
    console.log(`[account] Subscription cancelled for tenant ${slug}`);
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    console.error('[account] Cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/account — permanently delete tenant (GDPR-compliant) ─────────

accountRouter.delete('/', requireRole('tenant_admin'), async (req, res) => {
  const parse = deleteAccountSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'You must send { "confirm": "DELETE" } to proceed' });
    return;
  }

  const pool = getPool();
  const slug = req.tenantSlug!;

  try {
    // Look up tenant by slug (not req.user.tenantId which may be platform ID for super_admins)
    const { rows: [existing] } = await pool.query(
      'SELECT id, slug, stripe_subscription_id, stripe_connect_account_id FROM public.tenants WHERE slug = $1',
      [slug],
    );
    if (!existing) { res.status(404).json({ error: 'Tenant not found' }); return; }

    const tenantId = existing.id;

    // Record deletion request (permanent audit trail)
    await pool.query(
      `INSERT INTO public.deletion_requests (tenant_id, tenant_slug, requested_by, reason)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, existing.slug, req.user!.userId, 'Self-service account deletion'],
    );

    // Cancel Stripe subscription (non-fatal)
    const stripe = getStripe();
    if (stripe && existing.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(existing.stripe_subscription_id);
      } catch (err) {
        console.warn('[account] Stripe cancel failed (non-fatal):', (err as Error).message);
      }
    }

    // Deauthorize Stripe Connect (non-fatal)
    if (stripe && existing.stripe_connect_account_id) {
      try {
        await stripe.oauth.deauthorize({
          client_id: process.env.STRIPE_CLIENT_ID ?? '',
          stripe_user_id: existing.stripe_connect_account_id,
        });
      } catch (err) {
        console.warn('[account] Stripe Connect deauthorize failed (non-fatal):', (err as Error).message);
      }
    }

    // Purge all data (schema + public rows)
    await purgeAllTenantData(pool, tenantId);

    // Mark deletion as completed
    await pool.query(
      `UPDATE public.deletion_requests SET completed_at = now()
       WHERE tenant_slug = $1 AND completed_at IS NULL`,
      [slug],
    );

    // Flush resolver cache
    invalidateTenantCache(slug);

    // Purge Redis keys
    try {
      const { getRedisClient } = await import('@gadnuc/db');
      const redis = getRedisClient();
      if (redis) {
        const keys = await redis.keys(`*:${slug}:*`);
        if (keys.length) await redis.del(...keys);
      }
    } catch { /* Redis may not be configured */ }

    console.log(`[account] Self-service GDPR deletion complete: ${slug}`);
    res.status(204).send();
  } catch (err) {
    console.error('[account] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/account/password — change own password ────────────────────────

accountRouter.patch('/password', async (req, res) => {
  const parse = changePasswordSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { current_password, new_password } = parse.data;
  const slug = req.tenantSlug!;

  try {
    await withTenantSchema(slug, async (db) => {
      // Get current user's password hash
      const { rows: [user] } = await db.query(
        'SELECT id, password_hash FROM users WHERE auth_user_id = $1',
        [req.user!.userId],
      );
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }

      // Verify current password
      const valid = await verifyPassword(current_password, user.password_hash);
      if (!valid) { res.status(403).json({ error: 'Current password is incorrect' }); return; }

      // Hash and save new password
      const newHash = await hashPassword(new_password);
      await db.query(
        'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
        [newHash, user.id],
      );

      res.json({ message: 'Password updated successfully' });
    });
  } catch (err) {
    console.error('[account] Password change error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
