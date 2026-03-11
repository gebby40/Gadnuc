import { createServer } from 'node:http';
import { createPool, createReadPool, runMigrations, createRedisClient } from '@gadnuc/db';
import { createApp } from './app.js';
import { createMessagingSocket } from './services/messaging-socket.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  // Initialise DB pool and run pending migrations
  createPool();
  await runMigrations();

  // Initialise read replica pool (falls back to primary if REPLICA_URL not set)
  createReadPool();

  // Initialise Redis (MFA sessions, caching)
  createRedisClient();

  const app        = createApp();
  const httpServer = createServer(app);

  // Attach Socket.io messaging server
  createMessagingSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`[inventory-server] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('[inventory-server] Fatal startup error:', err);
  process.exit(1);
});
