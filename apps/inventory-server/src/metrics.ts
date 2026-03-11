/**
 * Prometheus metrics for inventory-server.
 *
 * Exposes:
 *  - Default Node.js process metrics (memory, CPU, event loop lag, GC)
 *  - HTTP request duration histogram (per route, method, status)
 *  - Per-tenant request counter
 *  - Active DB pool connection gauge
 */

import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export const register = new Registry();
register.setDefaultLabels({ service: 'inventory-server' });

// Default Node.js metrics (memory, CPU, GC, event loop lag)
collectDefaultMetrics({ register });

// ── HTTP request duration ─────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name:       'http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers:  [register],
});

// ── Per-tenant request counter ────────────────────────────────────────────────

export const tenantRequestCounter = new Counter({
  name:       'tenant_requests_total',
  help:       'Total HTTP requests grouped by tenant slug',
  labelNames: ['tenant_slug', 'method', 'status_code'],
  registers:  [register],
});

// ── DB pool connection gauge ──────────────────────────────────────────────────

export const dbPoolTotal = new Gauge({
  name:      'db_pool_total_connections',
  help:      'Total connections in the primary DB pool',
  registers: [register],
});

export const dbPoolIdle = new Gauge({
  name:      'db_pool_idle_connections',
  help:      'Idle connections in the primary DB pool',
  registers: [register],
});

export const dbPoolWaiting = new Gauge({
  name:      'db_pool_waiting_requests',
  help:      'Requests waiting for a DB pool connection',
  registers: [register],
});

// ── WebSocket connections gauge ───────────────────────────────────────────────

export const wsConnections = new Gauge({
  name:      'ws_active_connections',
  help:      'Active WebSocket connections',
  registers: [register],
});

// ── Messaging counters ────────────────────────────────────────────────────────

export const messagingMessagesSent = new Counter({
  name:       'messaging_messages_sent_total',
  help:       'Total real-time messages sent',
  labelNames: ['tenant_slug'],
  registers:  [register],
});

export const messagingRoomsCreated = new Counter({
  name:       'messaging_rooms_created_total',
  help:       'Total messaging rooms created',
  labelNames: ['room_type'],
  registers:  [register],
});

// ── Stripe checkout counter ───────────────────────────────────────────────────

export const stripeCheckoutSessions = new Counter({
  name:       'stripe_checkout_sessions_total',
  help:       'Total Stripe checkout sessions created',
  labelNames: ['tenant_slug', 'mode'],
  registers:  [register],
});

// ── Express middleware ────────────────────────────────────────────────────────

export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const end = httpRequestDuration.startTimer({ method: req.method });

    res.on('finish', () => {
      const route      = (req.route?.path as string | undefined) ?? req.path;
      const statusCode = String(res.statusCode);
      const slug       = req.tenantSlug ?? 'unknown';

      end({ route, status_code: statusCode });
      tenantRequestCounter.inc({ tenant_slug: slug, method: req.method, status_code: statusCode });
    });

    next();
  };
}

/** Update pool gauges — call periodically or after each request. */
export function updatePoolGauges(stats: { total: number; idle: number; waiting: number }): void {
  dbPoolTotal.set(stats.total);
  dbPoolIdle.set(stats.idle);
  dbPoolWaiting.set(stats.waiting);
}
