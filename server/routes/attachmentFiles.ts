import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments, notes } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { sanitizeFilenameForHeader } from '../lib/attachments.js';

export const attachmentFilesRouter = Router();
attachmentFilesRouter.use(requireAuth);

attachmentFilesRouter.get('/:id/file', async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.id), eq(attachments.userId, req.userId!)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }

    // The file on disk is AES-GCM ciphertext while the parent note is locked -- serve it only
    // through POST /api/notes/:id/unlock-attachment/:attachmentId, which requires the password.
    const [parentNote] = await db.select({ locked: notes.locked }).from(notes).where(eq(notes.id, row.noteId)).limit(1);
    if (parentNote?.locked) {
      res.status(403).json({ error: 'This note is locked.' });
      return;
    }

    const file = await localStorageAdapter.read(row.storageKey);
    if (!file) {
      res.status(404).json({ error: 'Attachment file not found.' });
      return;
    }

    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${sanitizeFilenameForHeader(row.originalName)}"`);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    file.stream.pipe(res);
  } catch (err) {
    console.error('Serve attachment failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
