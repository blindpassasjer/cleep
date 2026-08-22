import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';

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

export function setSessionCookie(res: Response, token: string, expires: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    // Self-hosted deployments are commonly served over plain HTTP (no reverse-proxy TLS in front
    // of the container) — a `secure` cookie would be silently dropped by the browser in that case.
    // Defaults to non-secure; set COOKIE_SECURE=true once a reverse proxy terminates HTTPS.
    secure: process.env.COOKIE_SECURE === 'true',
    signed: true,
    path: '/',
    expires,
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
