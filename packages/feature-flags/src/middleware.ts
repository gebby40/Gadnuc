import type { Request, Response, NextFunction } from 'express';
import { isFeatureEnabled } from './flags.js';

/**
 * featureGuard — returns 403 if a feature flag is not enabled for the current tenant.
 *
 * @example
 * router.use('/api/matrix', requireAuth, featureGuard('matrix'), matrixRouter)
 */
export function featureGuard(flagName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.tenant?.id ?? req.user?.tenantId;

    if (!tenantId) {
      res.status(401).json({ error: 'Tenant context required for feature check' });
      return;
    }

    const userId = req.user?.userId;
    const enabled = await isFeatureEnabled(flagName, tenantId, userId);

    if (!enabled) {
      res.status(403).json({
        error: `Feature "${flagName}" is not enabled for your plan`,
        feature: flagName,
      });
      return;
    }

    next();
  };
}
