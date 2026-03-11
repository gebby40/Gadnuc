import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { tenantMiddleware } from '@gadnuc/tenant';
import { register, metricsMiddleware, updatePoolGauges } from './metrics.js';
import { getPoolStats } from '@gadnuc/db';

import { productsRouter }    from './routes/products.js';
import { ordersRouter }      from './routes/orders.js';
import { filamentsRouter }   from './routes/filaments.js';
import { authRouter }        from './routes/auth.js';
import { usersRouter }       from './routes/users.js';
import { storefrontRouter }  from './routes/storefront.js';

export function createApp() {
  const app = express();

  // ── Security headers ─────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  }));

  // ── CORS ─────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.some(o => origin.endsWith(o))) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin "${origin}" not allowed`));
      }
    },
    credentials: true,
  }));

  // ── Body parsing ─────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

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

  // ── Health check (no auth, no tenant) ────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'inventory-server' }));

  // ── Prometheus scrape endpoint (internal — no auth, no tenant) ───────
  app.get('/metrics', async (_req, res) => {
    updatePoolGauges(getPoolStats().primary);
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // ── Tenant resolution (all routes below require a valid tenant) ───────
  app.use(tenantMiddleware);

  // ── API routes ────────────────────────────────────────────────────────
  app.use('/api/auth',        authRouter);
  app.use('/api/storefront',  storefrontRouter);
  app.use('/api/products',    productsRouter);
  app.use('/api/orders',      ordersRouter);
  app.use('/api/filaments',   filamentsRouter);
  app.use('/api/users',       usersRouter);

  // ── 404 & error handler ───────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[inventory-server] Unhandled error:', err.message);
    // Never expose stack traces in production
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
