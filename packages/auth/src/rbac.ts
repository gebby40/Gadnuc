import type { Request, Response, NextFunction } from 'express';

// Role hierarchy — higher index = more permissions
export const ROLES = ['viewer', 'operator', 'tenant_admin', 'super_admin'] as const;
export type Role = typeof ROLES[number];

function roleLevel(role: string): number {
  const idx = ROLES.indexOf(role as Role);
  return idx === -1 ? -1 : idx;
}

/**
 * requireRole — only allows users with an equal or higher role.
 *
 * @example
 * router.delete('/products/:id', requireAuth, requireRole('tenant_admin'), handler)
 */
export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (roleLevel(user.role) < roleLevel(minRole)) {
      res.status(403).json({
        error: `Insufficient permissions — requires ${minRole} or higher`,
      });
      return;
    }
    next();
  };
}

/**
 * requireAnyRole — allows any of the listed roles (exact match or higher).
 */
export function requireAnyRole(...roles: Role[]) {
  const minLevel = Math.min(...roles.map(roleLevel));
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (roleLevel(user.role) < minLevel) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
