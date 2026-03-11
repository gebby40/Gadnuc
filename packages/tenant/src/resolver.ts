import { getPool } from '@gadnuc/db';

export interface TenantContext {
  id:          string;
  slug:        string;
  displayName: string;
  planId:      string;
  status:      string;
  customDomain: string | null;
}

// In-memory cache — refreshed every 5 minutes
const cache = new Map<string, { tenant: TenantContext; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolve a tenant from a subdomain or custom domain string.
 * Returns null if the tenant is not found or is suspended/cancelled.
 */
export async function resolveTenant(host: string): Promise<TenantContext | null> {
  // Strip port
  const hostname = host.split(':')[0].toLowerCase();

  // Check cache first
  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.tenant;

  const pool = getPool();

  // Determine if this is a custom domain or a subdomain of our platform
  // e.g. acme.gadnuc.io  → slug = "acme"
  //      acme.com         → custom_domain lookup
  const platformDomain = process.env.PLATFORM_DOMAIN ?? 'gadnuc.io';

  let row: TenantContext | null = null;

  if (hostname.endsWith(`.${platformDomain}`)) {
    const slug = hostname.slice(0, hostname.length - platformDomain.length - 1);
    const { rows } = await pool.query<TenantContext>(
      `SELECT id, slug, display_name AS "displayName", plan_id AS "planId",
              status, custom_domain AS "customDomain"
       FROM public.tenants
       WHERE slug = $1 AND status NOT IN ('cancelled','suspended')`,
      [slug]
    );
    row = rows[0] ?? null;
  } else {
    // Custom domain lookup
    const { rows } = await pool.query<TenantContext>(
      `SELECT id, slug, display_name AS "displayName", plan_id AS "planId",
              status, custom_domain AS "customDomain"
       FROM public.tenants
       WHERE custom_domain = $1 AND status NOT IN ('cancelled','suspended')`,
      [hostname]
    );
    row = rows[0] ?? null;
  }

  if (row) {
    cache.set(hostname, { tenant: row, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return row;
}

export function invalidateTenantCache(hostname: string): void {
  cache.delete(hostname);
}
