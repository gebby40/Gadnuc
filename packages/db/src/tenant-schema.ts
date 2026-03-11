import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPool } from './client.js';

// Validated slug — only lowercase letters, digits, underscores (no SQL injection risk)
const SLUG_RE = /^[a-z0-9_]{1,63}$/;

function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid tenant slug: "${slug}"`);
  }
}

export interface TenantDbClient {
  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<R>>;
  release(): void;
  tenantSlug: string;
}

/**
 * Acquire a pool client locked to a specific tenant's schema.
 * Every query on this client automatically runs inside `tenant_<slug>` search path.
 */
export async function getTenantClient(tenantSlug: string): Promise<TenantDbClient> {
  assertValidSlug(tenantSlug);
  const pool = getPool();
  const client = await pool.connect();

  // Lock the search_path to this tenant's schema first, then public (for shared tables)
  await client.query(`SET search_path = tenant_${tenantSlug}, public`);

  return {
    tenantSlug,
    query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) {
      return client.query<R>(sql, params);
    },
    release() {
      // Reset search_path before returning the connection to the pool
      client.query('RESET search_path').finally(() => client.release());
    },
  };
}

/**
 * Run a callback with a tenant-scoped DB client, automatically releasing it afterwards.
 */
export async function withTenantSchema<T>(
  tenantSlug: string,
  fn: (db: TenantDbClient) => Promise<T>
): Promise<T> {
  const db = await getTenantClient(tenantSlug);
  try {
    return await fn(db);
  } finally {
    db.release();
  }
}

/**
 * Provision a new tenant schema by cloning the template schema.
 * Called automatically during tenant onboarding.
 */
export async function provisionTenantSchema(
  pool: Pool,
  tenantSlug: string
): Promise<void> {
  assertValidSlug(tenantSlug);
  const schemaName = `tenant_${tenantSlug}`;

  // Use a dedicated client for DDL — cannot be done inside a transaction on PG
  const client = await pool.connect();
  try {
    // Create schema if it does not already exist
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // Clone all tables from the tenant_template schema
    const { rows: tables } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'tenant_template'`
    );

    for (const { tablename } of tables) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${schemaName}.${tablename}
         (LIKE tenant_template.${tablename} INCLUDING ALL)`
      );
    }

    console.log(`[DB] Provisioned schema: ${schemaName} (${tables.length} tables)`);
  } finally {
    client.release();
  }
}

/**
 * Permanently delete a tenant schema and all its data.
 * GDPR-compliant tenant deletion — irreversible.
 */
export async function dropTenantSchema(pool: Pool, tenantSlug: string): Promise<void> {
  assertValidSlug(tenantSlug);
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS tenant_${tenantSlug} CASCADE`);
    console.log(`[DB] Dropped schema: tenant_${tenantSlug}`);
  } finally {
    client.release();
  }
}
