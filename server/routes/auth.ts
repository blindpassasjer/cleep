import { Router } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, sessions } from '../db/schema.js';
import {
  generateSessionToken,
  sessionExpiry,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  requireAuth,
} from '../middleware/session.js';
import { toPublicUser } from '../lib/user.js';

const BCRYPT_ROUNDS = 12;

const UNIQUE_VIOLATION = '23505';
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.json({ user: null, error: 'Email and password are required.' });
      return;
    }

    const emailLower = email.trim().toLowerCase();
    const rows = await db.select().from(users).where(eq(users.emailLower, emailLower)).limit(1);
    const row = rows[0];

    if (!row) {
      res.json({ user: null, error: 'Invalid email or password.' });
      return;
    }

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) {
      res.json({ user: null, error: 'Invalid email or password.' });
      return;
    }

    const token = generateSessionToken();
    const expiresAt = sessionExpiry();
    await db.insert(sessions).values({ token, userId: row.id, expiresAt });
    setSessionCookie(res, token, expiresAt);

    res.json({ user: toPublicUser(row), error: null });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    const token = getSessionToken(req);
    if (token) {
      await db.delete(sessions).where(eq(sessions.token, token));
    }
    clearSessionCookie(res);
    res.json({});
  } catch (err) {
    console.error('Logout failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

authRouter.get('/me', async (req, res) => {
  try {
    if (!req.userId) {
      res.json({ user: null });
      return;
    }
    const rows = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
    const row = rows[0];
    res.json({ user: row ? toPublicUser(row) : null });
  } catch (err) {
    console.error('Me lookup failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  try {
    const { email, username } = (req.body ?? {}) as Record<string, unknown>;
    const updates: Partial<typeof users.$inferInsert> = {};

    if (email !== undefined) {
      if (typeof email !== 'string' || !email.includes('@')) {
        res.json({ user: null, error: 'A valid email is required.' });
        return;
      }
      updates.email = email.trim();
      updates.emailLower = email.trim().toLowerCase();
    }

    if (username !== undefined) {
      if (typeof username !== 'string' || username.trim().length < 2) {
        res.json({ user: null, error: 'Username must be at least 2 characters.' });
        return;
      }
      updates.username = username.trim();
    }

    if (Object.keys(updates).length === 0) {
      res.json({ user: null, error: 'No changes provided.' });
      return;
    }

    const [row] = await db.update(users).set(updates).where(eq(users.id, req.userId!)).returning();
    res.json({ user: row ? toPublicUser(row) : null, error: null });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.json({ user: null, error: 'An account with this email or username already exists.' });
      return;
    }
    console.error('Profile update failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

authRouter.post('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof currentPassword !== 'string' || !currentPassword) {
      res.json({ error: 'Current password is required.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const rows = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    const row = rows[0];
    if (!row) {
      res.json({ error: 'Account not found.' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!valid) {
      res.json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.update(users).set({ passwordHash }).where(eq(users.id, req.userId!));
    res.json({ error: null });
  } catch (err) {
    console.error('Password update failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
