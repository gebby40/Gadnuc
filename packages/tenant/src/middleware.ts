import type { Request, Response, NextFunction } from 'express';
import { resolveTenant, type TenantContext } from './resolver.js';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      tenantSlug?: string;
    }
  }
}

/**
 * TenantMiddleware — resolves the current tenant from the request host header.
 *
 * Injects req.tenant and req.tenantSlug.
 * Returns 404 if the tenant cannot be found.
 * Returns 403 if the tenant is suspended.
 *
 * Place this middleware BEFORE requireAuth so auth can validate tenant context.
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Allow bypassing for internal health-check / platform-level routes
  if (req.path === '/health' || req.path === '/ping') {
    return next();
  }

  // Allow X-Tenant-Slug header for machine-to-machine API calls
  const overrideSlug = req.headers['x-tenant-slug'];
  const host = (typeof overrideSlug === 'string' ? `${overrideSlug}.gadnuc.io` : null)
    ?? req.headers.host
    ?? '';

  if (!host) {
    res.status(400).json({ error: 'Missing Host header' });
    return;
  }

  try {
    const tenant = await resolveTenant(host);

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    if (tenant.status === 'suspended') {
      res.status(403).json({ error: 'Account suspended — please contact support' });
      return;
    }

    req.tenant     = tenant;
    req.tenantSlug = tenant.slug;
    next();
  } catch (err) {
    console.error('[tenant] Resolution error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
