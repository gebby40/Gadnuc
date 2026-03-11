/**
 * Storefront settings API
 *
 * GET  /api/storefront/settings  — public (no auth required), tenant-scoped
 * PATCH /api/storefront/settings — requires tenant_admin role
 */

import { Router } from 'express';
import { z } from 'zod';
import { withTenantSchema } from '@gadnuc/db';
import { requireAuth } from '@gadnuc/auth';
import { requireRole } from '@gadnuc/auth';
import type { Request, Response } from 'express';

export const storefrontRouter = Router();

// ── GET /api/storefront/settings ──────────────────────────────────────────────
storefrontRouter.get('/settings', async (req: Request, res: Response) => {
  const tenant = (req as any).tenant as { id: number; slug: string } | undefined;
  if (!tenant) {
    res.status(400).json({ error: 'Tenant not resolved' });
    return;
  }

  try {
    const row = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM storefront_settings LIMIT 1',
      );
      return rows[0] ?? null;
    });

    res.json({ data: row ?? {} });
  } catch (err) {
    console.error('[storefront] GET settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/storefront/settings ───────────────────────────────────────────
const patchSchema = z.object({
  store_name:       z.string().min(1).max(100).optional(),
  tagline:          z.string().max(255).optional(),
  logo_url:         z.string().url().optional(),
  banner_url:       z.string().url().optional(),
  accent_color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  contact_email:    z.string().email().optional(),
  social_links:     z.record(z.string()).optional(),
  custom_domain:    z.string().optional(),
  is_public:        z.boolean().optional(),
}).strict();

storefrontRouter.patch(
  '/settings',
  requireAuth,
  requireRole('tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant    = (req as any).tenant as { id: number; slug: string } | undefined;
    if (!tenant) {
      res.status(400).json({ error: 'Tenant not resolved' });
      return;
    }

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
      return;
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      res.status(422).json({ error: 'No fields to update' });
      return;
    }

    // Build SET clause dynamically
    const keys   = Object.keys(updates) as (keyof typeof updates)[];
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values     = keys.map((k) => updates[k]);
    const sql = `
      INSERT INTO storefront_settings (${keys.join(', ')})
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
