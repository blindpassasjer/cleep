import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, notes, sessions } from '../db/schema.js';
import { requireAuth, requireAdmin } from '../middleware/session.js';
import { getRegistrationOpen, setRegistrationOpen } from '../lib/settings.js';
import { deleteAttachmentFilesForNotes } from '../lib/attachments.js';

const BCRYPT_ROUNDS = 12;

const UNIQUE_VIOLATION = '23505';
function isUniqueViolation(err: unknown): boolean {
  // drizzle can surface the driver error directly or wrapped under `.cause`.
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (_req, res) => {
  try {
    const userRows = await db.select().from(users).orderBy(users.createdAt);
    const noteCounts = await db.select({ userId: notes.userId, count: sql<number>`count(*)::int` }).from(notes).groupBy(notes.userId);
    const countByUser = new Map(noteCounts.map((row) => [row.userId, row.count]));

    res.json({
      users: userRows.map((row) => ({
        id: row.id,
        email: row.email,
        username: row.username,
        role: row.role,
        createdAt: row.createdAt,
        noteCount: countByUser.get(row.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error('List users failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminRouter.post('/users', async (req, res) => {
  try {
    const { email, username, password, role } = (req.body ?? {}) as Record<string, unknown>;

    if (typeof email !== 'string' || !email.includes('@')) {
      res.json({ user: null, error: 'A valid email is required.' });
      return;
    }
    if (typeof username !== 'string' || username.trim().length < 2) {
      res.json({ user: null, error: 'Username must be at least 2 characters.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.json({ user: null, error: 'Password must be at least 8 characters.' });
      return;
    }
    const resolvedRole = role === 'admin' ? 'admin' : 'user';

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const emailLower = email.trim().toLowerCase();
    const [row] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: email.trim(),
        emailLower,
        username: username.trim(),
        passwordHash,
        role: resolvedRole,
      })
      .returning();

    res.status(201).json({ user: { id: row.id, email: row.email, username: row.username, role: row.role, createdAt: row.createdAt, noteCount: 0 }, error: null });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.json({ user: null, error: 'An account with this email already exists.' });
      return;
    }
    console.error('Create user failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminRouter.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.userId) {
      res.status(400).json({ error: "You can't delete your own account here. Sign in as a different admin." });
      return;
    }

    const rows = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    const target = rows[0];
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (target.role === 'admin') {
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
      if (admins.length <= 1) {
        res.status(400).json({ error: 'Cannot delete the last admin account.' });
        return;
      }
    }

    // Attachment files live on disk, not in the DB, so they don't disappear via the users->notes
    // cascade below -- clean them up first, the same way a direct note delete does (see
    // deleteAttachmentFilesForNotes's own doc comment).
    const userNotes = await db.select({ id: notes.id }).from(notes).where(eq(notes.userId, req.params.id));
    await deleteAttachmentFilesForNotes(userNotes.map((n) => n.id));

    await db.delete(users).where(eq(users.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete user failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminRouter.patch('/users/:id', async (req, res) => {
  try {
    const { email, username } = (req.body ?? {}) as Record<string, unknown>;
    const updates: { email?: string; emailLower?: string; username?: string } = {};

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
      res.json({ user: null, error: 'Nothing to update.' });
      return;
    }

    const [row] = await db.update(users).set(updates).where(eq(users.id, req.params.id)).returning();
    if (!row) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notes)
      .where(eq(notes.userId, row.id));
    res.json({
      user: { id: row.id, email: row.email, username: row.username, role: row.role, createdAt: row.createdAt, noteCount: countRow?.count ?? 0 },
      error: null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('Update user failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminRouter.post('/users/:id/password', async (req, res) => {
  try {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { newPassword } = (req.body ?? {}) as Record<string, unknown>;
    let password: string;
    let generated = false;
    if (newPassword === undefined || newPassword === null || newPassword === '') {
      // A URL-safe random temp password the admin passes to the user out-of-band.
      password = crypto.randomBytes(12).toString('base64url');
      generated = true;
    } else if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.json({ ok: false, error: 'Password must be at least 8 characters.' });
      return;
    } else {
      password = newPassword;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.update(users).set({ passwordHash }).where(eq(users.id, req.params.id));
    // Force every existing session for this user to re-authenticate.
    await db.delete(sessions).where(eq(sessions.userId, req.params.id));

    res.json({ ok: true, tempPassword: generated ? password : undefined, error: null });
  } catch (err) {
    console.error('Reset user password failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminRouter.get('/settings', async (_req, res) => {
  try {
    res.json({ registrationOpen: await getRegistrationOpen() });
  } catch (err) {
    console.error('Get settings failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

adminRouter.patch('/settings', async (req, res) => {
  try {
    const { registrationOpen } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof registrationOpen !== 'boolean') {
      res.json({ error: 'registrationOpen must be a boolean.' });
      return;
    }
    await setRegistrationOpen(registrationOpen);
    res.json({ registrationOpen, error: null });
  } catch (err) {
    console.error('Update settings failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
