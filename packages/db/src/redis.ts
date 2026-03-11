import { Redis, type RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;

export function createRedisClient(options?: RedisOptions): Redis {
  const url = process.env.REDIS_URL;

  redisClient = url
    ? new Redis(url, { lazyConnect: true, ...options })
    : new Redis({ host: 'localhost', port: 6379, lazyConnect: true, ...options });

  redisClient.on('error', (err) => {
    console.error('[Redis] Error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected');
  });

  return redisClient;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialised — call createRedisClient() first');
  }
  return redisClient;
}
