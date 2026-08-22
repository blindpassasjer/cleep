import { and, inArray, isNotNull, lt } from 'drizzle-orm';
import { db } from './client.js';
import { notes } from './schema.js';
import { deleteAttachmentFilesForNotes } from '../lib/attachments.js';

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // matches Google Keep's 7-day trash window

/** Permanently deletes notes that have sat in the trash longer than the retention window. */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);

  const expired = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(isNotNull(notes.trashedAt), lt(notes.trashedAt, cutoff)));
  if (expired.length === 0) return 0;

  const noteIds = expired.map((n) => n.id);
  // Must run before the note rows are deleted -- see deleteAttachmentFilesForNotes's own comment.
  await deleteAttachmentFilesForNotes(noteIds);
  // Delete exactly the notes selected above (not by re-evaluating the time condition), so a note
  // that crosses the cutoff between the select and this delete isn't swept up without its files
  // having been cleaned first.
  await db.delete(notes).where(inArray(notes.id, noteIds));

  console.log(`purgeExpiredTrash: permanently deleted ${noteIds.length} note(s) past the trash retention window.`);
  return noteIds.length;
}
