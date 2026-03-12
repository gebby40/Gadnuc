import { Pool, PoolConfig } from 'pg';

// DB_SSL=false disables SSL for local/Docker environments where the Postgres
// server has no TLS certificate (e.g. docker-compose).  In production leave
// this unset; SSL with certificate verification is enforced automatically.
function sslConfig(): { rejectUnauthorized: boolean } | false {
  if (process.env.DB_SSL === 'false') return false;
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false;
}

// ── Primary (read-write) pool ─────────────────────────────────────────────────

let pool: Pool | null = null;

export function createPool(config?: PoolConfig): Pool {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max:                     20,
    idleTimeoutMillis:  30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout:      30_000, // 30s — prevents runaway queries from holding connections
    ssl: sslConfig(),
    ...config,
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database pool not initialised — call createPool() first');
  return pool;
}

// ── Read-replica pool ─────────────────────────────────────────────────────────
// Populated only when DATABASE_REPLICA_URL is set.
// Falls back to the primary pool so callers never need to branch on null.

let readPool: Pool | null = null;

export function createReadPool(config?: PoolConfig): Pool {
  const url = process.env.DATABASE_REPLICA_URL ?? process.env.DATABASE_URL;
  readPool = new Pool({
    connectionString: url,
    max:                     10,
    idleTimeoutMillis:  30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout:      30_000,
    ssl: sslConfig(),
    ...config,
  });

  readPool.on('error', (err) => {
    console.error('[DB:replica] Unexpected pool error:', err.message);
  });

  const label = process.env.DATABASE_REPLICA_URL ? 'replica' : 'primary (replica not configured)';
  console.log(`[DB] Read pool initialised → ${label}`);
  return readPool;
}

export function getReadPool(): Pool {
  // Graceful fallback: if no replica is configured, use the primary pool
  if (!readPool) {
    if (!pool) throw new Error('Database pool not initialised — call createPool() first');
    return pool;
  }
  return readPool;
}

// ── Pool stats (for /admin/db/health) ────────────────────────────────────────

export interface PoolStats {
  total:   number;
  idle:    number;
  waiting: number;
}

export function getPoolStats(): { primary: PoolStats; replica: PoolStats | null } {
  const primary = pool
    ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
    : { total: 0, idle: 0, waiting: 0 };

  const replica = readPool
    ? { total: readPool.totalCount, idle: readPool.idleCount, waiting: readPool.waitingCount }
    : null;

  return { primary, replica };
}
