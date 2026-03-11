/**
 * Refresh-token store — persists hashed refresh tokens in public.refresh_tokens.
 *
 * Security model:
 *  - Tokens are stored as SHA-256 hashes (never plaintext).
 *  - On rotation a new token is issued; the old one is marked `revoked = true`.
 *  - Token-reuse detection: if a revoked token is presented, ALL tokens for
 *    that user are immediately revoked (family-invalidation / rotation attack defence).
 */

import { createHash, randomBytes } from 'crypto';
import { getPool } from '@gadnuc/db';

const TOKEN_BYTES = 48; // 384 bits of entropy → base64 ~64 chars
const TTL_DAYS   = 30;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export async function storeRefreshToken(opts: {
  token:    string;
  userId:   string;
  tenantId: string;
}): Promise<void> {
  const pool = getPool();
  const hash = sha256(opts.token);
  await pool.query(
    `INSERT INTO public.refresh_tokens
       (token_hash, user_id, tenant_id, expires_at)
     VALUES ($1, $2, $3, now() + $4::interval)`,
    [hash, opts.userId, opts.tenantId, `${TTL_DAYS} days`],
  );
}

export type RotateResult =
  | { ok: true;  userId: string; tenantId: string; newToken: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'reuse_detected' };

/**
 * Validate the incoming refresh token and, if valid, atomically revoke it
 * and return a freshly generated replacement.
 */
export async function rotateRefreshToken(incomingToken: string): Promise<RotateResult> {
  const pool   = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = sha256(incomingToken);

    const { rows } = await client.query<{
      id: number; user_id: string; tenant_id: string;
      revoked: boolean; expires_at: string;
    }>(
      `SELECT id, user_id, tenant_id, revoked, expires_at
       FROM public.refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [hash],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }

    const row = rows[0];

    // Token reuse: revoked token presented — wipe the entire family
    if (row.revoked) {
      await client.query(
        `UPDATE public.refresh_tokens
         SET    revoked = true
         WHERE  user_id = $1 AND tenant_id = $2 AND revoked = false`,
        [row.user_id, row.tenant_id],
      );
      await client.query('COMMIT');
      return { ok: false, reason: 'reuse_detected' };
    }

    if (new Date(row.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'expired' };
    }

    // Revoke the current token
    await client.query(
      'UPDATE public.refresh_tokens SET revoked = true WHERE id = $1',
      [row.id],
    );

    // Issue a new token
    const newToken = generateRefreshToken();
    await client.query(
      `INSERT INTO public.refresh_tokens
         (token_hash, user_id, tenant_id, expires_at)
       VALUES ($1, $2, $3, now() + $4::interval)`,
      [sha256(newToken), row.user_id, row.tenant_id, `${TTL_DAYS} days`],
    );

    await client.query('COMMIT');
    return { ok: true, userId: String(row.user_id), tenantId: String(row.tenant_id), newToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'UPDATE public.refresh_tokens SET revoked = true WHERE token_hash = $1',
    [sha256(token)],
  );
}

export async function revokeAllUserTokens(userId: string, tenantId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE public.refresh_tokens
     SET    revoked = true
     WHERE  user_id = $1 AND tenant_id = $2 AND revoked = false`,
    [userId, tenantId],
  );
}
