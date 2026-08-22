import { and, isNotNull, lt } from 'drizzle-orm';
import { db } from './client.js';
import { notes } from './schema.js';

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // matches Google Keep's 7-day trash window

/** Permanently deletes notes that have sat in the trash longer than the retention window. */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const deleted = await db
    .delete(notes)
    .where(and(isNotNull(notes.trashedAt), lt(notes.trashedAt, cutoff)))
    .returning({ id: notes.id });

  if (deleted.length > 0) {
    console.log(`purgeExpiredTrash: permanently deleted ${deleted.length} note(s) past the trash retention window.`);
  }
  return deleted.length;
}
