import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AuthUser } from './jwt.js';

// Extend Express request with our auth user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);

  // Also accept token in cookie (for storefront SSR)
  if (req.cookies?.access_token) return req.cookies.access_token as string;

  return null;
}

/**
 * requireAuth — hard gate. Returns 401 if no valid token is present.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = await verifyAccessToken(token);

    // Enforce tenant isolation: the token's tenantSlug must match the request's tenant
    const requestTenantSlug = (req as Request & { tenantSlug?: string }).tenantSlug;
    if (requestTenantSlug && payload.tenantSlug !== requestTenantSlug) {
      res.status(403).json({ error: 'Token does not belong to this tenant' });
      return;
    }

    req.user = {
      userId:     payload.sub,
      tenantId:   payload.tenantId,
      tenantSlug: payload.tenantSlug,
      role:       payload.role,
      email:      payload.email,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * optionalAuth — attaches user if token is present, but does not block.
 * Useful for public routes that behave differently for logged-in users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      req.user = {
        userId:     payload.sub,
        tenantId:   payload.tenantId,
        tenantSlug: payload.tenantSlug,
        role:       payload.role,
        email:      payload.email,
      };
    } catch {
      // Ignore invalid tokens on optional routes
    }
  }
  next();
}
