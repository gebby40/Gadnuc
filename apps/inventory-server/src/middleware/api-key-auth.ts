/**
 * API key authentication middleware.
 *
 * Tenants can create API keys for programmatic access. Each key is scoped
 * to a single tenant and carries a role (operator or viewer).
 *
 * Keys are passed via `X-API-Key` header. They are stored as SHA-256 hashes
 * in the database; the raw key is only ever shown once at creation time.
 *
 * Usage:
 *   router.get('/api/products', apiKeyOrBearerAuth, handler)
 */

import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getPool } from '@gadnuc/db';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  name: string;
  role: string;
  scopes: string[];
}

/**
 * Authenticate via X-API-Key header.
 * Sets req.user on success (same shape as JWT auth).
 * Returns 401 if no valid key and no Bearer token is present.
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) return next(); // fall through to Bearer auth

  const keyHash = sha256(apiKey);
  const pool = getPool();

  try {
    const { rows } = await pool.query<ApiKeyRow>(
      `SELECT ak.id, ak.tenant_id, t.slug AS tenant_slug, ak.name, ak.role, ak.scopes
       FROM public.api_keys ak
       JOIN public.tenants t ON t.id = ak.tenant_id
       WHERE ak.key_hash = $1
         AND ak.is_active = true
         AND (ak.expires_at IS NULL OR ak.expires_at > now())
       LIMIT 1`,
      [keyHash],
    );

    if (!rows[0]) {
      res.status(401).json({ error: 'Invalid or expired API key' });
      return;
    }

    const row = rows[0];

    // Check tenant isolation
    const requestTenantSlug = req.tenantSlug;
    if (requestTenantSlug && row.tenant_slug !== requestTenantSlug) {
      res.status(403).json({ error: 'API key does not belong to this tenant' });
      return;
    }

    // Update last_used_at (fire-and-forget)
    pool.query(
      'UPDATE public.api_keys SET last_used_at = now() WHERE id = $1',
      [row.id],
    ).catch(() => {});

    // Set req.user compatible with JWT auth shape
    req.user = {
      userId:     `apikey:${row.id}`,
      tenantId:   row.tenant_id,
      tenantSlug: row.tenant_slug,
      role:       row.role,
      email:      `apikey-${row.name}@system`,
    };
    req.tenantSlug = row.tenant_slug;

    next();
  } catch (err) {
    console.error('[api-key-auth] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Combined auth: accepts either Bearer token OR X-API-Key.
 * If both are present, Bearer token takes precedence.
 */
export async function apiKeyOrBearerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // If Bearer token is present, let the standard auth middleware handle it
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return next();

  // Try API key
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }

  // Neither present
  res.status(401).json({ error: 'Authentication required (Bearer token or X-API-Key)' });
}
