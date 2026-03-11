import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export function createPool(config?: PoolConfig): Pool {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
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
