/**
 * MFA intermediate sessions — stored in Redis with a short TTL.
 *
 * After a successful password check for an MFA-enabled account, we create an
 * mfa-session keyed by a random UUID.  The client must complete the TOTP
 * verification within MFA_TTL_SECONDS or start over.
 */

import { randomUUID } from 'crypto';
import { getRedisClient } from '@gadnuc/db';

const MFA_TTL_SECONDS = 5 * 60; // 5 minutes
const KEY_PREFIX      = 'mfa:';

export interface MfaSessionData {
  userId:   string;
  tenantId: string;
  tenantSlug: string;
}

export async function createMfaSession(data: MfaSessionData): Promise<string> {
  const mfaToken = randomUUID();
  const redis    = getRedisClient();
  await redis.set(
    `${KEY_PREFIX}${mfaToken}`,
    JSON.stringify(data),
    'EX',
    MFA_TTL_SECONDS,
  );
  return mfaToken;
}

export async function getMfaSession(mfaToken: string): Promise<MfaSessionData | null> {
  const redis = getRedisClient();
  const raw   = await redis.get(`${KEY_PREFIX}${mfaToken}`);
  if (!raw) return null;
  return JSON.parse(raw) as MfaSessionData;
}

export async function deleteMfaSession(mfaToken: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${KEY_PREFIX}${mfaToken}`);
}
