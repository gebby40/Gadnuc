import type { Request, Response, NextFunction } from 'express';
import { resolveTenant, type TenantContext } from './resolver.js';

declare global {
  namespace Express {
    interface Request {
      tenant?:     TenantContext;
      tenantSlug?: string;
    }
  }
}

/**
 * TenantMiddleware — resolves the current tenant from Host header or
 * X-Tenant-Slug override, then enforces lifecycle-aware access control.
 *
 * Status → HTTP response mapping:
 *   trialing / active   → 200 (proceed normally)
 *   provisioning        → 503 Service Unavailable (schema still being set up)
 *   failed              → 503 Service Unavailable (provisioning error)
 *   past_due            → 402 Payment Required
 *   suspended           → 402 Payment Required
 *   cancelled           → 410 Gone
 */
export async function tenantMiddleware(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  // Internal platform routes bypass tenant resolution
  if (req.path === '/health' || req.path === '/ping' || req.path === '/metrics') {
    return next();
  }

  const overrideSlug    = req.headers['x-tenant-slug'];
  const platformDomain  = process.env.PLATFORM_DOMAIN ?? 'gadnuc.io';
  const host = (typeof overrideSlug === 'string' ? `${overrideSlug}.${platformDomain}` : null)
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

    switch (tenant.status) {
      case 'trialing':
      case 'active':
        break; // allowed — fall through to provisioning check

      case 'past_due':
        res.status(402).json({
          error: 'Payment required — please update your billing details',
          code:  'past_due',
        });
        return;

      case 'suspended':
        res.status(402).json({
          error: 'Account suspended — please contact support',
          code:  'suspended',
        });
        return;

      case 'cancelled':
        res.status(410).json({
          error: 'This account has been cancelled',
          code:  'cancelled',
        });
        return;
    }

    // Provisioning guard — schema may not be ready yet
    if (tenant.provisioningState === 'provisioning') {
      res.status(503).json({
        error:       'Account is being provisioned — please try again in a moment',
        retry_after: 10,
      });
      return;
    }

    if (tenant.provisioningState === 'failed') {
      res.status(503).json({
        error: 'Account provisioning failed — please contact support',
        code:  'provisioning_failed',
      });
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
