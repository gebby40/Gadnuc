import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { createPool } from './client.js';


const MIGRATIONS_DIR = join(__dirname, 'migrations');

const MIGRATION_FILES = [
  '001_public_schema.sql',
  '002_tenant_template.sql',
  '003_phase1_additions.sql',
  '004_phase2_additions.sql',
  '005_storefront_analytics.sql',
  '006_messaging.sql',
  '007_stripe_connect.sql',
  '008_webhooks.sql',
  '009_api_keys.sql',
  '010_platform_admins.sql',
  '011_storefront_appearance.sql',
  '012_custom_homepage.sql',
  '013_product_enhancements.sql',
  '014_discount_rules.sql',
  '015_wholesale_pricing.sql',
  '016_customer_accounts.sql',
];

export async function runMigrations(pool?: Pool): Promise<void> {
  const db = pool ?? createPool();

  const client = await db.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version     TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const file of MIGRATION_FILES) {
      const version = file.replace('.sql', '');
      const { rowCount } = await client.query(
        'SELECT 1 FROM public.schema_migrations WHERE version = $1',
        [version]
      );

      if (rowCount && rowCount > 0) {
        console.log(`[migrate] Already applied: ${version}`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`[migrate] Applying: ${version}...`);
      await client.query(sql);
      await client.query(
        'INSERT INTO public.schema_migrations (version) VALUES ($1)',
        [version]
      );
      console.log(`[migrate] Done: ${version}`);
    }

    console.log('[migrate] All migrations applied.');
  } finally {
    client.release();
  }
}

// Allow running directly: node dist/migrate.js
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
