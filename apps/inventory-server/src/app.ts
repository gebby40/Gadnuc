import express from 'express';
import helmet  from 'helmet';
import cors    from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit    from 'express-rate-limit';
import { tenantMiddleware } from '@gadnuc/tenant';
import { register, metricsMiddleware, updatePoolGauges } from './metrics.js';
import { getPoolStats, getPool, getRedisClient } from '@gadnuc/db';
import { requestLogger } from './middleware/request-logger.js';

import { productsRouter }       from './routes/products.js';
import { ordersRouter }         from './routes/orders.js';
import { filamentsRouter }      from './routes/filaments.js';
import { authRouter }           from './routes/auth.js';
import { usersRouter }          from './routes/users.js';
import { storefrontRouter, handleStripeWebhook } from './routes/storefront.js';
import { uploadsRouter }        from './routes/uploads.js';
import { messagingRouter }      from './routes/messaging.js';
import { stripeConnectRouter }  from './routes/stripe-connect.js';
import { webhooksRouter }       from './routes/webhooks.js';
import { apiKeysRouter }        from './routes/api-keys.js';
import { authDiscoverRouter }   from './routes/auth-discover.js';
import { featureGuard }         from '@gadnuc/feature-flags';
import { tenantRateLimit }      from './middleware/tenant-rate-limit.js';
import { globalErrorHandler }   from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  // ── Security headers ─────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        frameSrc:   ["'self'", 'https://js.stripe.com'],
        fontSrc:    ["'self'"],
        objectSrc:  ["'none'"],
        baseUri:    ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // ── CORS ─────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin "${origin}" not allowed`));
      }
    },
    credentials: true,
    maxAge: 86400,
  }));

  // ── Response compression ───────────────────────────────────────────
  app.use(compression());

  // ── Stripe webhook — MUST be registered before express.json() ────────
  // Stripe requires the raw (unparsed) body for signature verification.
  app.post(
    '/api/storefront/checkout/webhook',
    express.raw({ type: 'application/json' }),
    handleStripeWebhook,
  );

  // ── Body parsing ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // ── Structured request logging ─────────────────────────────────────
  app.use(requestLogger);

  // ── Global rate limiting ─────────────────────────────────────────────
  app.use(rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — please slow down' },
  }));

  // ── Metrics middleware (before tenant so all requests are timed) ──────
  app.use(metricsMiddleware());

  // ── Health check (liveness — no auth, no tenant) ───────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'inventory-server' }));

  // ── Readiness check (dependency checks — no auth, no tenant) ───────
  app.get('/ready', async (_req, res) => {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      await getPool().query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
      healthy = false;
    }

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'error';
        healthy = false;
      }
    } else {
      checks.redis = 'disabled';
    }

    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ready' : 'degraded', checks });
  });

  // ── Prometheus scrape endpoint (internal — no auth, no tenant) ───────
  app.get('/metrics', async (_req, res) => {
    updatePoolGauges(getPoolStats().primary);
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // ── Slug-less tenant login (before tenant resolution — no slug needed) ──
  app.use('/api/auth', authDiscoverRouter);

  // ── Tenant resolution (all routes below require a valid tenant) ───────
  app.use(tenantMiddleware);

  // ── Per-tenant rate limiting (after tenant resolution) ───────────────
  app.use(tenantRateLimit());

  // ── API routes ────────────────────────────────────────────────────────
  app.use('/api/auth',           authRouter);
  app.use('/api/storefront',     storefrontRouter);
  app.use('/api/products',       productsRouter);
  app.use('/api/orders',         ordersRouter);
  app.use('/api/filaments',      filamentsRouter);
  app.use('/api/users',          usersRouter);
  app.use('/api/uploads',        uploadsRouter);
  app.use('/api/messaging',      featureGuard('matrix'), messagingRouter);
  app.use('/api/stripe-connect', stripeConnectRouter);
  app.use('/api/webhooks',       webhooksRouter);
  app.use('/api/api-keys',       apiKeysRouter);

  // ── 404 ──────────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // ── Global error handler (must be last) ──────────────────────────────
  app.use(globalErrorHandler);

  return app;
}
