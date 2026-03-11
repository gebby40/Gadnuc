/**
 * Admin endpoints — DB health, metrics, and operational tooling.
 * All routes require super_admin role.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool, getReadPool, getPoolStats, listTenantSchemas } from '@gadnuc/db';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('super_admin'));

// ── GET /api/admin/db/health ──────────────────────────────────────────────────

adminRouter.get('/db/health', async (_req, res) => {
  try {
    const pool     = getPool();
    const readPool = getReadPool();

    // Check primary connectivity
    const { rows: [pgVersion] } = await pool.query<{ version: string }>(
      'SELECT version()',
    );

    // Check replication lag (only meaningful on replica — view returns NULL on primary)
    let replicationLagSec: number | null = null;
    try {
      const { rows: [lag] } = await readPool.query<{ lag_seconds: number | null }>(
        'SELECT lag_seconds FROM public.replication_lag',
      );
      replicationLagSec = lag?.lag_seconds ?? null;
    } catch {/* replica may not have the view yet */}

    // Pool stats
    const poolStats = getPoolStats();

    // Tenant schema inventory
    const schemas = await listTenantSchemas(pool);

    // Tenant status breakdown
    const { rows: statusBreakdown } = await pool.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::int AS count
       FROM public.tenants
       GROUP BY status
       ORDER BY status`,
    );

    // Schema count from pg_namespace for accuracy
    const { rows: [schemaCount] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM pg_catalog.pg_namespace
       WHERE nspname LIKE 'tenant\\_%' ESCAPE '\\'`,
    );

    // Pending migrations
    const { rows: appliedMigrations } = await pool.query<{ version: string; applied_at: string }>(
      `SELECT version, applied_at FROM public.schema_migrations ORDER BY applied_at`,
    );

    res.json({
      status: 'ok',
      postgres: {
        version:          pgVersion.version,
        replication_lag_sec: replicationLagSec,
      },
      pools:   poolStats,
      tenants: {
        schema_count:     parseInt(schemaCount.count, 10),
        status_breakdown: statusBreakdown,
        schemas,
      },
      migrations: appliedMigrations,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin] DB health check error:', err);
    res.status(500).json({ error: 'Health check failed', detail: (err as Error).message });
  }
});

// ── GET /api/admin/db/tenants/:slug/stats ─────────────────────────────────────
// Per-tenant table row counts from pg_stat_user_tables

adminRouter.get('/db/tenants/:slug/stats', async (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9_]{1,63}$/.test(slug)) {
    res.status(400).json({ error: 'Invalid slug' });
    return;
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      table_name: string;
      row_estimate: string;
      total_bytes: string;
    }>(
      `SELECT
         relname                              AS table_name,
         reltuples::bigint                   AS row_estimate,
         pg_total_relation_size(c.oid)::bigint AS total_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
         AND c.relkind = 'r'
       ORDER BY total_bytes DESC`,
      [`tenant_${slug}`],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Tenant schema not found' });
      return;
    }

    res.json({ slug, tables: rows });
  } catch (err) {
    console.error('[admin] Tenant stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/admin/cache/clear ───────────────────────────────────────────────

adminRouter.post('/cache/clear', async (_req, res) => {
  const { clearTenantCache } = await import('@gadnuc/tenant');
  clearTenantCache();
  res.json({ message: 'Tenant resolver cache cleared' });
});
