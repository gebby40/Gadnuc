/**
 * Structured request logging with correlation IDs.
 *
 * - Generates X-Request-ID for every request (or uses incoming header)
 * - Logs method, path, status, duration, user, tenant as JSON
 * - Skips noisy internal endpoints (/health, /ready, /metrics)
 */

import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const SKIP_PATHS = new Set(['/health', '/ready', '/metrics']);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path)) { next(); return; }

  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  const start = Date.now();

  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const log = {
      ts:        new Date().toISOString(),
      requestId,
      method:    req.method,
      path:      req.originalUrl,
      status:    res.statusCode,
      ms:        Date.now() - start,
      userId:    req.user?.userId ?? null,
      tenantId:  req.user?.tenantId ?? null,
      ip:        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                   ?? req.socket.remoteAddress,
    };

    if (res.statusCode >= 500) {
      console.error(JSON.stringify(log));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify(log));
    } else {
      console.log(JSON.stringify(log));
    }
  });

  next();
}
