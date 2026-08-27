import type { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Max requests permitted per client (keyed by req.ip) within a window. */
  max: number;
}

const DEFAULT_AUTH_WINDOW_MS = 60_000;
const DEFAULT_AUTH_MAX = 20;
const DEFAULT_UPLOAD_MAX = 60;

function readIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

/**
 * Simple in-memory fixed-window limiter. Fine for a single-instance self-hosted deployment --
 * a multi-process/multi-host setup would need a shared store, but Cleep doesn't ship that way.
 *
 * Each returned middleware keeps its own bucket map. Expired entries are swept lazily on every
 * call so the map can't grow without bound from one-off IPs.
 */
export function createRateLimit({ windowMs, max }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? 'unknown';

    // Lazy sweep: drop every entry whose window has already elapsed.
    if (hits.size > 0) {
      for (const [k, v] of hits) {
        if (v.resetAt < now) hits.delete(k);
      }
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }

    entry.count += 1;
    next();
  };
}

/**
 * Limiter for auth endpoints (login/register/password). Tunable via AUTH_RATE_LIMIT_MAX and
 * AUTH_RATE_LIMIT_WINDOW_MS; defaults preserve the historical 20 requests / 60s.
 */
export const authRateLimit = createRateLimit({
  windowMs: readIntEnv('AUTH_RATE_LIMIT_WINDOW_MS', DEFAULT_AUTH_WINDOW_MS),
  max: readIntEnv('AUTH_RATE_LIMIT_MAX', DEFAULT_AUTH_MAX),
});

/**
 * Limiter for write-heavy endpoints (attachment uploads, data export/import). Tunable via
 * UPLOAD_RATE_LIMIT_MAX / UPLOAD_RATE_LIMIT_WINDOW_MS.
 */
export const uploadRateLimit = createRateLimit({
  windowMs: readIntEnv('UPLOAD_RATE_LIMIT_WINDOW_MS', DEFAULT_AUTH_WINDOW_MS),
  max: readIntEnv('UPLOAD_RATE_LIMIT_MAX', DEFAULT_UPLOAD_MAX),
});
