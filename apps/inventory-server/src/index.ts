import { createServer } from 'node:http';
import { createPool, createReadPool, runMigrations, createRedisClient, getPool, getRedisClient } from '@gadnuc/db';
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

  // ── Graceful shutdown ────────────────────────────────────────────────
  let shuttingDown = false;

  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[inventory-server] ${signal} received — shutting down gracefully`);

    // Force exit after 10s if graceful shutdown stalls
    const forceTimer = setTimeout(() => {
      console.error('[inventory-server] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    httpServer.close(async () => {
      console.log('[inventory-server] HTTP server closed');
      try {
        await getPool().end();
        console.log('[inventory-server] DB pool closed');
      } catch (err) {
        console.error('[inventory-server] Error closing DB pool:', err);
      }
      try {
        const redis = getRedisClient();
        if (redis) {
          await redis.quit();
          console.log('[inventory-server] Redis connection closed');
        }
      } catch (err) {
        console.error('[inventory-server] Error closing Redis:', err);
      }
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[inventory-server] Fatal startup error:', err);
  process.exit(1);
});
