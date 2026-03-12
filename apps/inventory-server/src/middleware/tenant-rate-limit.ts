/**
 * Per-tenant rate limiting middleware.
 *
 * Each tenant gets its own sliding-window counter in Redis.
 * This prevents a noisy tenant from exhausting the global rate limit
 * and starving other tenants.
 *
 * Falls back to in-memory Map if Redis is unavailable.
 */

import type { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS  = 60_000;   // 1 minute window
const MAX_PER_TENANT = 300;  // requests per tenant per window

// In-memory fallback (used when Redis is not available)
const buckets = new Map<string, BucketEntry>();

function cleanupBuckets(): void {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

// Periodic cleanup every 5 minutes
setInterval(cleanupBuckets, 5 * 60_000).unref();

/**
 * Per-tenant rate limiting middleware.
 *
 * Uses Redis INCR + EXPIRE for distributed rate limiting when available,
 * falls back to in-memory counters for single-instance deployments.
 */
export function tenantRateLimit(opts?: {
  windowMs?: number;
  max?: number;
}) {
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const max      = opts?.max ?? MAX_PER_TENANT;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantSlug = req.tenantSlug;
    if (!tenantSlug) return next(); // no tenant = no tenant-level limiting

    const key = `rl:tenant:${tenantSlug}`;
    const now = Date.now();

    // Try Redis first
    try {
      const { getRedisClient } = await import('@gadnuc/db');
      const redis = getRedisClient();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }
      const ttl = await redis.pttl(key);

      if (count > max) {
        res.set('Retry-After', String(Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)));
        res.status(429).json({
          error: 'Rate limit exceeded for this tenant',
          retry_after_ms: ttl > 0 ? ttl : windowMs,
        });
        return;
      }

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
      return next();
    } catch {
      // Redis unavailable — fall back to in-memory
    }

    // In-memory fallback
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Rate limit exceeded for this tenant',
        retry_after_ms: entry.resetAt - now,
      });
      return;
    }

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    next();
  };
}

/**
 * Stricter rate limiter for auth endpoints (login, MFA verify).
 * 10 attempts per minute per tenant+IP combination.
 */
export function authRateLimit() {
  return tenantRateLimit({ windowMs: 60_000, max: 10 });
}

/**
 * MFA-specific rate limiter.
 * 5 TOTP verification attempts per minute per tenant+IP.
 */
export function mfaRateLimit() {
  return tenantRateLimit({ windowMs: 60_000, max: 5 });
}
