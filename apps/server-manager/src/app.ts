import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { register, metricsMiddleware } from './metrics.js';

import { tenantsRouter }      from './routes/tenants.js';
import { featureFlagsRouter } from './routes/feature-flags.js';
import { billingRouter }      from './routes/billing.js';
import { auditRouter }        from './routes/audit.js';
import { adminRouter }        from './routes/admin.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.ADMIN_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, max: 100 }));
  app.use(metricsMiddleware());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'server-manager' }));

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // All management routes require super_admin role — enforced in each router
  app.use('/api/tenants',       tenantsRouter);
  app.use('/api/feature-flags', featureFlagsRouter);
  app.use('/api/billing',       billingRouter);
  app.use('/api/audit',         auditRouter);
  app.use('/api/admin',         adminRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[server-manager] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
