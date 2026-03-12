/**
 * MFA intermediate sessions — stored in Redis with a short TTL.
 * Falls back to an in-memory Map when Redis is not configured.
 *
 * After a successful password check for an MFA-enabled account, we create an
 * mfa-session keyed by a random UUID.  The client must complete the TOTP
 * verification within MFA_TTL_SECONDS or start over.
 */

import { randomUUID } from 'crypto';
import { getRedisClient } from '@gadnuc/db';

const MFA_TTL_SECONDS = 5 * 60; // 5 minutes
const KEY_PREFIX      = 'mfa:';

// ── In-memory fallback when Redis is unavailable ─────────────────────────────
const memStore = new Map<string, { data: string; expiresAt: number }>();

function memCleanup() {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (entry.expiresAt <= now) memStore.delete(key);
  }
}

// Sweep expired entries every 60s
setInterval(memCleanup, 60_000).unref();

// ─────────────────────────────────────────────────────────────────────────────

export interface MfaSessionData {
  userId:   string;
  tenantId: string;
  tenantSlug: string;
}

export async function createMfaSession(data: MfaSessionData): Promise<string> {
  const mfaToken = randomUUID();
  const redis    = getRedisClient();

  if (redis) {
    await redis.set(
      `${KEY_PREFIX}${mfaToken}`,
      JSON.stringify(data),
      'EX',
      MFA_TTL_SECONDS,
    );
  } else {
    memStore.set(`${KEY_PREFIX}${mfaToken}`, {
      data: JSON.stringify(data),
      expiresAt: Date.now() + MFA_TTL_SECONDS * 1000,
    });
  }

  return mfaToken;
}

export async function getMfaSession(mfaToken: string): Promise<MfaSessionData | null> {
  const key   = `${KEY_PREFIX}${mfaToken}`;
  const redis = getRedisClient();

  let raw: string | null = null;
  if (redis) {
    raw = await redis.get(key);
  } else {
    const entry = memStore.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      raw = entry.data;
    } else if (entry) {
      memStore.delete(key);
    }
  }

  if (!raw) return null;
  return JSON.parse(raw) as MfaSessionData;
}

export async function deleteMfaSession(mfaToken: string): Promise<void> {
  const key   = `${KEY_PREFIX}${mfaToken}`;
  const redis = getRedisClient();

  if (redis) {
    await redis.del(key);
  } else {
    memStore.delete(key);
  }
}
