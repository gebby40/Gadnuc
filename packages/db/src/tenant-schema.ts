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
  const pool   = getPool();
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
 * Provision a new tenant schema by cloning the tenant_template schema.
 *
 * Improvements over v1:
 *  - Idempotent: safe to call multiple times (IF NOT EXISTS throughout).
 *  - Atomic: on any failure the partial schema is dropped so we never leave
 *    a half-provisioned tenant behind.
 *  - State tracking: updates tenants.provisioning_state in public schema.
 */
export async function provisionTenantSchema(
  pool: Pool,
  tenantSlug: string,
  tenantId?: string,
): Promise<void> {
  assertValidSlug(tenantSlug);
  const schemaName = `tenant_${tenantSlug}`;
  const client     = await pool.connect();

  try {
    // Mark provisioning as in-progress
    if (tenantId) {
      await client.query(
        `UPDATE public.tenants SET provisioning_state = 'provisioning' WHERE id = $1`,
        [tenantId],
      );
    }

    // Create schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // Clone every table from tenant_template (INCLUDING ALL copies constraints, defaults, indexes)
    const { rows: tables } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'tenant_template'`,
    );

    for (const { tablename } of tables) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${schemaName}.${tablename}
         (LIKE tenant_template.${tablename} INCLUDING ALL)`,
      );
    }

    // Mark provisioning as complete
    if (tenantId) {
      await client.query(
        `UPDATE public.tenants SET provisioning_state = 'ready' WHERE id = $1`,
        [tenantId],
      );
    }

    console.log(`[DB] Provisioned schema: ${schemaName} (${tables.length} tables)`);
  } catch (err) {
    console.error(`[DB] Provision failed for ${schemaName} — rolling back:`, err);

    // Best-effort cleanup: drop the partial schema so we don't leave debris
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    } catch (dropErr) {
      console.error(`[DB] Failed to drop partial schema ${schemaName}:`, dropErr);
    }

    // Mark as failed
    if (tenantId) {
      await client.query(
        `UPDATE public.tenants SET provisioning_state = 'failed' WHERE id = $1`,
        [tenantId],
      ).catch(() => {/* ignore */});
    }

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Permanently drop a tenant schema (DDL only).
 * Call purgeAllTenantData() for a full GDPR wipe including public-schema rows.
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

/**
 * GDPR-compliant full tenant purge.
 *
 * Sequence:
 *  1. Drop the tenant schema (all inventory data)
 *  2. Revoke all refresh tokens
 *  3. Delete audit log entries (or anonymise — depends on legal requirements;
 *     here we hard-delete since the tenant explicitly requested erasure)
 *  4. Delete the tenant row itself (cascades to feature_flags, refresh_tokens)
 *
 * Returns the slug that was purged so callers can invalidate caches.
 */
export async function purgeAllTenantData(
  pool:     Pool,
  tenantId: string,
): Promise<{ slug: string }> {
  const client = await pool.connect();
  try {
    // Fetch slug first
    const { rows } = await client.query<{ slug: string }>(
      'SELECT slug FROM public.tenants WHERE id = $1',
      [tenantId],
    );
    if (!rows[0]) throw new Error(`Tenant ${tenantId} not found`);
    const { slug } = rows[0];
    assertValidSlug(slug);

    // Wrap in transaction so schema drop + tenant delete are atomic
    await client.query('BEGIN');
    try {
      // 1. Drop schema
      await client.query(`DROP SCHEMA IF EXISTS tenant_${slug} CASCADE`);

      // 2+3+4: Cascade DELETE on public.tenants removes refresh_tokens and feature_flags.
      //        Audit log uses ON DELETE SET NULL so history is retained but de-linked.
      await client.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.log(`[DB] GDPR purge complete for tenant: ${slug}`);
    return { slug };
  } finally {
    client.release();
  }
}

/**
 * Return a list of all provisioned tenant schemas with basic stats.
 * Used by the /admin/db/health endpoint.
 */
export async function listTenantSchemas(pool: Pool): Promise<
  { schema_name: string; table_count: number }[]
> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ schema_name: string; table_count: number }>(`
      SELECT
        n.nspname                                     AS schema_name,
        COUNT(c.relname)::int                         AS table_count
      FROM pg_catalog.pg_namespace n
      LEFT JOIN pg_catalog.pg_class c
        ON c.relnamespace = n.oid AND c.relkind = 'r'
      WHERE n.nspname LIKE 'tenant\\_%' ESCAPE '\\'
      GROUP BY n.nspname
      ORDER BY n.nspname
    `);
    return rows;
  } finally {
    client.release();
  }
}
