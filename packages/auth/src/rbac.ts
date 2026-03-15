import type { Request, Response, NextFunction } from 'express';

// Role hierarchy — higher index = more permissions
export const ROLES = ['customer', 'viewer', 'operator', 'tenant_admin', 'super_admin'] as const;
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
 * requireAnyRole — allows users who have one of the exact listed roles.
 *
 * Unlike requireRole (which uses role hierarchy), this checks for exact membership.
 * Example: requireAnyRole('viewer', 'super_admin') allows ONLY those two roles.
 */
export function requireAnyRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(user.role as Role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
