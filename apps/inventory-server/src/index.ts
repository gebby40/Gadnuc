import { createPool, runMigrations } from '@gadnuc/db';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  // Initialise DB pool and run pending migrations
  createPool();
  await runMigrations();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`[inventory-server] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[inventory-server] Fatal startup error:', err);
  process.exit(1);
});
