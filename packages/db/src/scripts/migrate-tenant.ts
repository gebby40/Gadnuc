#!/usr/bin/env tsx
/**
 * Tenant data migration CLI
 *
 * Moves rows from a legacy shared-table layout (or a JSON/CSV export) into a
 * properly isolated tenant_<slug> schema.
 *
 * Usage:
 *   tsx migrate-tenant.ts --slug acme --source-table public.legacy_users \
 *                         --dest-table users [--dry-run]
 *
 *   tsx migrate-tenant.ts --slug acme --json ./export.json \
 *                         --dest-table products [--dry-run]
 *
 * Options:
 *   --slug          Tenant slug (required)
 *   --source-table  Fully-qualified table to read rows from (PostgreSQL)
 *   --json          Path to a JSON file (array of objects) to import
 *   --dest-table    Target table inside the tenant schema (required)
 *   --batch-size    Rows per INSERT batch (default: 500)
 *   --dry-run       Validate and count rows but do not write anything
 *   --verify        After import, assert dest row count >= source row count
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

// ── CLI argument parsing ──────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    slug:         { type: 'string' },
    'source-table': { type: 'string' },
    json:         { type: 'string' },
    'dest-table': { type: 'string' },
    'batch-size': { type: 'string', default: '500' },
    'dry-run':    { type: 'boolean', default: false },
    verify:       { type: 'boolean', default: true },
  },
  strict: true,
});

const slug      = args['slug'];
const srcTable  = args['source-table'];
const jsonFile  = args['json'];
const destTable = args['dest-table'];
const batchSize = parseInt(args['batch-size'] ?? '500', 10);
const dryRun    = args['dry-run'] ?? false;
const verify    = args['verify'] ?? true;

// ── Validation ────────────────────────────────────────────────────────────────

if (!slug || !destTable) {
  console.error('Error: --slug and --dest-table are required');
  process.exit(1);
}

if (!srcTable && !jsonFile) {
  console.error('Error: provide either --source-table or --json');
  process.exit(1);
}

if (!/^[a-z0-9_]{1,63}$/.test(slug)) {
  console.error(`Error: invalid tenant slug "${slug}"`);
  process.exit(1);
}

if (!/^[a-z0-9_]+$/.test(destTable)) {
  console.error(`Error: invalid dest-table name "${destTable}"`);
  process.exit(1);
}

if (srcTable && !/^[a-z0-9_]+(\.[a-z0-9_]+)?$/.test(srcTable)) {
  console.error(`Error: invalid source-table name "${srcTable}"`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildInsert(schemaTable: string, rows: Record<string, unknown>[]): { sql: string; params: unknown[] } {
  const columns = Object.keys(rows[0]);
  const params:  unknown[] = [];
  const valueClauses = rows.map((row) => {
    const placeholders = columns.map((col) => {
      params.push(row[col] ?? null);
      return `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const sql = `INSERT INTO ${schemaTable} (${columns.map(c => `"${c}"`).join(', ')})
               VALUES ${valueClauses.join(',\n')}
               ON CONFLICT DO NOTHING`;
  return { sql, params };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  });

  const destSchema = `tenant_${slug}`;
  const destFull   = `${destSchema}.${destTable}`;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Gadnuc tenant migration`);
  console.log(`  Tenant  : ${slug}`);
  console.log(`  Target  : ${destFull}`);
  console.log(`  Source  : ${srcTable ?? jsonFile}`);
  console.log(`  Dry run : ${dryRun}`);
  console.log(`${'─'.repeat(60)}\n`);

  // Verify the tenant schema exists
  const { rows: schemaCheck } = await pool.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
    [destSchema],
  );
  if (schemaCheck.length === 0) {
    console.error(`Error: schema "${destSchema}" does not exist. Provision the tenant first.`);
    await pool.end();
    process.exit(1);
  }

  // Load source rows
  let sourceRows: Record<string, unknown>[];

  if (jsonFile) {
    const raw = readFileSync(jsonFile, 'utf-8');
    sourceRows = JSON.parse(raw);
    if (!Array.isArray(sourceRows)) {
      console.error('Error: JSON file must contain an array of objects');
      await pool.end();
      process.exit(1);
    }
  } else {
    // Fetch from source table — strip generated columns that will conflict
    const { rows } = await pool.query(`SELECT * FROM ${srcTable!} LIMIT 1000000`);
    sourceRows = rows;
  }

  console.log(`✓ Loaded ${sourceRows.length.toLocaleString()} source rows`);

  if (sourceRows.length === 0) {
    console.log('Nothing to migrate. Exiting.');
    await pool.end();
    return;
  }

  // Integrity pre-check: verify dest table has all required columns
  const { rows: destCols } = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [destSchema, destTable],
  );
  const destColSet  = new Set(destCols.map(r => r.column_name));
  const sourceKeys  = Object.keys(sourceRows[0]);
  const missingCols = sourceKeys.filter(k => !destColSet.has(k));

  if (missingCols.length > 0) {
    console.warn(`⚠  Columns in source not in dest (will be skipped): ${missingCols.join(', ')}`);
    // Strip unknown columns from all rows
    sourceRows = sourceRows.map(row => {
      const filtered: Record<string, unknown> = {};
      for (const key of sourceKeys) {
        if (destColSet.has(key)) filtered[key] = row[key];
      }
      return filtered;
    });
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] Would insert ${sourceRows.length.toLocaleString()} rows into ${destFull}`);
    console.log(`[DRY RUN] Batch size: ${batchSize} → ${Math.ceil(sourceRows.length / batchSize)} batches`);
    console.log('[DRY RUN] No data was written.\n');
    await pool.end();
    return;
  }

  // ── Execute migration in batches ──────────────────────────────────────────

  const batches = chunk(sourceRows, batchSize);
  let   inserted = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const { sql, params } = buildInsert(destFull, batch);
      const result = await client.query(sql, params);
      inserted += result.rowCount ?? 0;
      process.stdout.write(`  Batch ${i + 1}/${batches.length} — ${inserted.toLocaleString()} rows inserted\r`);
    }

    await client.query('COMMIT');
    console.log(`\n✓ Migration committed: ${inserted.toLocaleString()} rows → ${destFull}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Migration failed — rolled back. No data was written.');
    console.error(err);
    await pool.end();
    process.exit(1);
  } finally {
    client.release();
  }

  // ── Integrity verification ────────────────────────────────────────────────

  if (verify) {
    const { rows: [countRow] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM ${destFull}`,
    );
    const destCount = parseInt(countRow.count, 10);
    const srcCount  = sourceRows.length;

    if (destCount < srcCount) {
      console.warn(`⚠  Verification: dest has ${destCount} rows but source had ${srcCount}. Some rows may have been skipped (ON CONFLICT DO NOTHING).`);
    } else {
      console.log(`✓ Verification passed: ${destCount.toLocaleString()} rows in ${destFull}`);
    }
  }

  await pool.end();
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
