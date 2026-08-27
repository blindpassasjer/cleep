import './env.js';
import { afterEach, afterAll } from 'vitest';
import { db } from '../server/db/client.js';
import { sql } from 'drizzle-orm';

// Wiped between every test so cases stay independent. `app_settings` is truncated too so the
// registration-open flag never leaks across tests.
const TABLES = ['sessions', 'note_labels', 'attachments', 'notes', 'labels', 'app_settings', 'users'];

afterEach(async () => {
  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));
});

afterAll(async () => {
  // drizzle's node-postgres pool -- close it so the worker can exit cleanly.
  const pool = (db as unknown as { $client?: { end: () => Promise<void> } }).$client;
  await pool?.end();
});
