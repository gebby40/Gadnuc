import { Redis, type RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;
let redisDisabled = false;

/**
 * Initialise Redis.  When REDIS_URL is empty / unset the function logs a
 * warning and leaves the client as null — callers must tolerate a null return
 * from getRedisClient().
 */
export function createRedisClient(options?: RedisOptions): Redis | null {
  const url = process.env.REDIS_URL;

  if (!url) {
    console.warn('[Redis] REDIS_URL not set — Redis features disabled (MFA sessions will use in-memory fallback)');
    redisDisabled = true;
    return null;
  }

  redisClient = new Redis(url, { lazyConnect: true, ...options });

  redisClient.on('error', (err) => {
    console.error('[Redis] Error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected');
  });

  return redisClient;
}

/** Returns the Redis client, or null when Redis is not configured. */
export function getRedisClient(): Redis | null {
  if (redisDisabled) return null;
  return redisClient;
}

/** True when Redis was deliberately skipped (no REDIS_URL). */
export function isRedisDisabled(): boolean {
  return redisDisabled;
}
