import type { Request, Response, NextFunction } from 'express';

/**
 * Tiny in-memory rate limiter (no dependency). Good enough for a single
 * backend instance; swap for a Redis store if you ever run several replicas.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Drop expired buckets periodically so the map cannot grow forever.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
if (typeof sweeper.unref === 'function') sweeper.unref();

/**
 * Client identity for rate limiting.
 *
 * Uses Express's `req.ip`, which honours the `trust proxy` setting and parses
 * X-Forwarded-For from the trusted proxy. The raw header must never be read
 * here: clients can send it themselves and would get a fresh bucket per
 * request, defeating every limit.
 */
const clientIp = (req: Request): string => {
  const ip = req.ip || req.socket?.remoteAddress || '';
  // Normalise IPv4-mapped IPv6 addresses (::ffff:1.2.3.4).
  return ip.replace(/^::ffff:/, '') || 'unknown';
};

export function rateLimit(options: { windowMs: number; max: number; name: string; message?: string }) {
  const { windowMs, max, name } = options;
  const message = options.message || 'Too many requests. Please try again later.';

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message,
        retryAfter
      });
    }

    return next();
  };
}
