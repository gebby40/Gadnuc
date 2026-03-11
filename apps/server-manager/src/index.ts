import { createPool, runMigrations } from '@gadnuc/db';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT ?? '3002', 10);

async function main() {
  createPool();
  await runMigrations();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[server-manager] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server-manager] Fatal startup error:', err);
  process.exit(1);
});
