/**
 * API key management routes.
 *
 * Tenant admins can create, list, and revoke API keys for programmatic access.
 *
 * POST   /api/api-keys       — create a new API key
 * GET    /api/api-keys       — list tenant's API keys (hashed, no raw key)
 * DELETE /api/api-keys/:id   — revoke (delete) an API key
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';
import { tenantRateLimit } from '../middleware/tenant-rate-limit.js';

export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth, requireRole('tenant_admin'));

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  // Format: gad_<48 random hex chars> → 52 chars total
  return `gad_${randomBytes(24).toString('hex')}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ── Validation ────────────────────────────────────────────────────────────────

const createKeySchema = z.object({
  name:       z.string().min(1).max(100),
  role:       z.enum(['operator', 'viewer']).default('viewer'),
  scopes:     z.array(z.string().max(100)).max(50).default([]),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

// ── POST /api/api-keys ────────────────────────────────────────────────────────

apiKeysRouter.post('/', tenantRateLimit({ max: 20 }), async (req, res) => {
  const parse = createKeySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(422).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const tenantId = req.user!.tenantId;
  const { name, role, scopes, expires_in_days } = parse.data;
  const rawKey  = generateApiKey();
  const keyHash = sha256(rawKey);
  const prefix  = rawKey.slice(0, 8); // Store prefix for identification

  const pool = getPool();

  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO public.api_keys
         (tenant_id, key_hash, key_prefix, name, role, scopes, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb,
               CASE WHEN $7::int IS NOT NULL THEN now() + ($7::int * interval '1 day') ELSE NULL END,
               $8)
       RETURNING id, name, role, scopes, key_prefix, is_active, expires_at, created_at`,
      [
        tenantId,
        keyHash,
        prefix,
        name,
        role,
        JSON.stringify(scopes),
        expires_in_days ?? null,
        req.user!.userId,
      ],
    );

    // Return the raw key ONLY at creation time
    res.status(201).json({
      data: { ...row, key: rawKey },
      message: 'Save this API key — it will not be shown again.',
    });
  } catch (err) {
    console.error('[api-keys] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/api-keys ─────────────────────────────────────────────────────────

apiKeysRouter.get('/', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, scopes, key_prefix, is_active,
              expires_at, last_used_at, created_at
       FROM public.api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/api-keys/:id ──────────────────────────────────────────────────

apiKeysRouter.delete('/:id', async (req, res) => {
  const pool = getPool();

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM public.api_keys WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user!.tenantId],
    );
    if (!rowCount) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
