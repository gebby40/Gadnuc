/**
 * Prometheus metrics for server-manager.
 */

import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export const register = new Registry();
register.setDefaultLabels({ service: 'server-manager' });

collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name:       'http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers:  [register],
});

export const tenantProvisioningCounter = new Counter({
  name:       'tenant_provisioning_total',
  help:       'Tenant provisioning attempts by outcome',
  labelNames: ['outcome'],   // 'success' | 'failure'
  registers:  [register],
});

export const activeTenantGauge = new Gauge({
  name:      'tenants_active_total',
  help:      'Number of tenants with status = active',
  registers: [register],
});

export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const end = httpRequestDuration.startTimer({ method: req.method });
    res.on('finish', () => {
      const route      = (req.route?.path as string | undefined) ?? req.path;
      const statusCode = String(res.statusCode);
      end({ route, status_code: statusCode });
    });
    next();
  };
}
