import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- standard Express request-augmentation pattern
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function generateSessionToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

/**
 * `persistent` controls "keep me logged in": when true the cookie carries an `expires` date and
 * survives browser restarts (up to the session's server-side TTL); when false it's a classic
 * session cookie with no `expires` at all, so the browser drops it as soon as it's closed — the
 * server-side session row still exists with its normal TTL as an upper bound, but the cookie
 * itself is what actually determines "stay logged in after closing the browser" here.
 */
export function setSessionCookie(res: Response, token: string, expires: Date, persistent: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    // Self-hosted deployments are commonly served over plain HTTP (no reverse-proxy TLS in front
    // of the container) — a `secure` cookie would be silently dropped by the browser in that case.
    // Defaults to non-secure; set COOKIE_SECURE=true once a reverse proxy terminates HTTPS.
    secure: process.env.COOKIE_SECURE === 'true',
    signed: true,
    path: '/',
    ...(persistent ? { expires } : {}),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function getSessionToken(req: Request): string | null {
  const token = req.signedCookies?.[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/** Resolves the session cookie to a userId and attaches it to the request, if valid. Never rejects. */
export async function attachSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getSessionToken(req);
    if (!token) return next();

    const rows = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
    const session = rows[0];
    if (!session || session.expiresAt.getTime() < Date.now()) return next();

    req.userId = session.userId;
    next();
  } catch (err) {
    console.error('Session lookup failed:', err);
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
}

/** Must run after requireAuth. Only queried on admin-gated routes, not on every request. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (rows[0]?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    next();
  } catch (err) {
    console.error('Admin check failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
