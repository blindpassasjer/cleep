import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from './client.js';
import { users } from './schema.js';

const BCRYPT_ROUNDS = 12;

/**
 * Idempotent admin bootstrap. If ADMIN_EMAIL/ADMIN_PASSWORD are both set and no user with that
 * email exists yet, creates one with role 'admin'. If both are unset, this is a no-op (an admin
 * may already exist in the database from a previous run). If a user with that email already
 * exists but isn't an admin, it is left untouched — we never silently promote an existing
 * account to admin.
 */
export async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email && !password) return;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set, or both left unset.');
  }

  const emailLower = email.trim().toLowerCase();
  const rows = await db.select().from(users).where(eq(users.emailLower, emailLower)).limit(1);
  const existing = rows[0];

  if (existing) {
    if (existing.role !== 'admin') {
      console.warn(
        `bootstrapAdmin: a user with email ${email} already exists but is not an admin; skipping ` +
          'promotion to avoid unexpected privilege escalation.',
      );
    } else {
      console.log('bootstrapAdmin: admin account already exists, nothing to do.');
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = crypto.randomUUID();
  const username = emailLower.split('@')[0] || 'admin';

  await db.insert(users).values({
    id,
    email: email.trim(),
    emailLower,
    username,
    passwordHash,
    role: 'admin',
  });

  console.log(`bootstrapAdmin: created admin account for ${email}.`);
}

async function main() {
  await bootstrapAdmin();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('bootstrapAdmin failed:', err);
      process.exit(1);
    });
}
