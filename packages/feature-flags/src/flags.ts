import { getPool } from '@gadnuc/db';

interface FlagRow {
  flag_name: string;
  enabled: boolean;
  rollout_pct: number;
  tenant_id: string | null;
}

// Cache: key = `${tenantId}:${flagName}` → { enabled, expiresAt }
const cache = new Map<string, { enabled: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

function cacheKey(flagName: string, tenantId?: string): string {
  return tenantId ? `${tenantId}:${flagName}` : `global:${flagName}`;
}

/**
 * Check if a feature flag is enabled for a tenant.
 *
 * Resolution order (most specific wins):
 *   1. Tenant-specific override (tenant_id = tenantId)
 *   2. Global flag (tenant_id IS NULL)
 *   3. Default: false
 */
export async function isFeatureEnabled(
  flagName: string,
  tenantId: string,
  userId?: string   // For percentage-based rollouts
): Promise<boolean> {
  const key = cacheKey(flagName, tenantId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;

  const pool = getPool();
  const { rows } = await pool.query<FlagRow>(
    `SELECT flag_name, enabled, rollout_pct, tenant_id
     FROM public.feature_flags
     WHERE flag_name = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
     ORDER BY tenant_id NULLS LAST
     LIMIT 2`,
    [flagName, tenantId]
  );

  // Tenant-specific row takes priority
  const row = rows.find(r => r.tenant_id === tenantId) ?? rows[0];

  let enabled = false;
  if (row?.enabled) {
    if (row.rollout_pct >= 100) {
      enabled = true;
    } else if (userId) {
      // Deterministic hash of userId + flagName for stable percentage rollout
      const hash = Array.from(userId + flagName).reduce(
        (acc, char) => (acc * 31 + char.charCodeAt(0)) & 0xffffffff, 0
      );
      enabled = (Math.abs(hash) % 100) < row.rollout_pct;
    }
  }

  cache.set(key, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
  return enabled;
}

/**
 * Returns all enabled flag names for a tenant (for front-end feature gating).
 */
export async function getEnabledFlags(tenantId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ flag_name: string }>(
    `SELECT DISTINCT ON (flag_name) flag_name
     FROM public.feature_flags
     WHERE (tenant_id = $1 OR tenant_id IS NULL) AND enabled = true
     ORDER BY flag_name, tenant_id NULLS LAST`,
    [tenantId]
  );
  return rows.map(r => r.flag_name);
}

export function invalidateFlagCache(flagName: string, tenantId?: string): void {
  cache.delete(cacheKey(flagName, tenantId));
}
