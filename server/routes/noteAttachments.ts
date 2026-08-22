import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, notes } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { attachmentToApi, kindFromMime, parseWaveformPeaks, sanitizeFilenameForPath, uploadSingleAttachment } from '../lib/attachments.js';

export const noteAttachmentsRouter = Router({ mergeParams: true });
noteAttachmentsRouter.use(requireAuth);

async function assertOwnsNote(userId: string, noteId: string): Promise<boolean> {
  const rows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

noteAttachmentsRouter.get('/', async (req, res) => {
  try {
    const noteId = (req.params as { noteId: string }).noteId;
    if (!(await assertOwnsNote(req.userId!, noteId))) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    const rows = await db.select().from(attachments).where(eq(attachments.noteId, noteId)).orderBy(asc(attachments.createdAt));
    res.json({ attachments: rows.map(attachmentToApi) });
  } catch (err) {
    console.error('List attachments failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

noteAttachmentsRouter.post('/', uploadSingleAttachment, async (req, res) => {
  try {
    const noteId = (req.params as { noteId: string }).noteId;
    if (!(await assertOwnsNote(req.userId!, noteId))) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }
    const kind = kindFromMime(file.mimetype);
    if (!kind) {
      res.status(400).json({ error: 'Only image, video, and audio files are accepted.' });
      return;
    }

    const id = crypto.randomUUID();
    const storageKey = `${req.userId}/${noteId}/${id}-${sanitizeFilenameForPath(file.originalname)}`;
    await localStorageAdapter.save(storageKey, file.buffer);

    const [row] = await db
      .insert(attachments)
      .values({
        id,
        noteId,
        userId: req.userId!,
        kind,
        originalName: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        waveformPeaks: kind === 'audio' ? parseWaveformPeaks(req.body?.waveformPeaks) : null,
      })
      .returning();

    res.status(201).json({ attachment: attachmentToApi(row) });
  } catch (err) {
    console.error('Upload attachment failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

noteAttachmentsRouter.delete('/:attachmentId', async (req, res) => {
  try {
    const noteId = (req.params as { noteId: string; attachmentId: string }).noteId;
    if (!(await assertOwnsNote(req.userId!, noteId))) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    const [row] = await db
      .delete(attachments)
      .where(and(eq(attachments.id, req.params.attachmentId), eq(attachments.noteId, noteId)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    await localStorageAdapter.delete(row.storageKey);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete attachment failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
