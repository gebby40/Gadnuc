import { getPool } from '@gadnuc/db';

export interface TenantContext {
  id:               string;
  slug:             string;
  displayName:      string;
  planId:           string;
  status:           'trialing' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  customDomain:     string | null;
  provisioningState: 'provisioning' | 'ready' | 'failed';
}

// In-memory cache — per hostname, refreshed every 5 minutes
const cache = new Map<string, { tenant: TenantContext; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve a tenant from a hostname (subdomain or custom domain).
 *
 * Returns the tenant regardless of status — the middleware decides what
 * HTTP response to send based on tenant.status.
 * Returns null only if the tenant truly does not exist.
 */
export async function resolveTenant(host: string): Promise<TenantContext | null> {
  const hostname = host.split(':')[0].toLowerCase();

  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.tenant;

  const pool           = getPool();
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'gadnuc.com';

  let row: TenantContext | null = null;

  if (hostname.endsWith(`.${platformDomain}`)) {
    const slug = hostname.slice(0, hostname.length - platformDomain.length - 1);
    const { rows } = await pool.query<TenantContext>(
      `SELECT id, slug,
              display_name       AS "displayName",
              plan_id            AS "planId",
              status,
              custom_domain      AS "customDomain",
              provisioning_state AS "provisioningState"
       FROM public.tenants
       WHERE slug = $1`,
      [slug],
    );
    row = rows[0] ?? null;
  } else {
    const { rows } = await pool.query<TenantContext>(
      `SELECT id, slug,
              display_name       AS "displayName",
              plan_id            AS "planId",
              status,
              custom_domain      AS "customDomain",
              provisioning_state AS "provisioningState"
       FROM public.tenants
       WHERE custom_domain = $1`,
      [hostname],
    );
    row = rows[0] ?? null;
  }

  if (row) {
    cache.set(hostname, { tenant: row, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return row;
}

/** Evict a specific hostname from the resolver cache (e.g., after status change). */
export function invalidateTenantCache(slug: string): void {
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'gadnuc.com';
  cache.delete(`${slug}.${platformDomain}`);
  // Also evict any custom-domain entries for this slug
  for (const [key, val] of cache.entries()) {
    if (val.tenant.slug === slug) cache.delete(key);
  }
}

/** Evict the entire resolver cache (e.g., after a bulk status update). */
export function clearTenantCache(): void {
  cache.clear();
}
