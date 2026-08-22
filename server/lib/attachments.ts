import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments } from '../db/schema.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';

export const ATTACHMENT_MAX_SIZE_BYTES = 100 * 1024 * 1024; // covers a short video/audio recording

type AttachmentRow = typeof attachments.$inferSelect;
export type AttachmentKind = 'image' | 'video' | 'audio';

export function kindFromMime(mimeType: string): AttachmentKind | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!kindFromMime(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
});

/** Wraps multer's single-file middleware so its errors come back as normal JSON error responses. */
export function uploadSingleAttachment(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const asAny = err as { code?: string; message?: string };
    if (asAny.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: `File is too large. Maximum size is ${ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024)}MB.` });
      return;
    }
    if (asAny.message === 'INVALID_FILE_TYPE') {
      res.status(400).json({ error: 'Only image, video, and audio files are accepted.' });
      return;
    }
    console.error('Attachment upload failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
}

export function sanitizeFilenameForPath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

const MAX_WAVEFORM_SAMPLES = 200;

/** Parses the optional multipart "waveformPeaks" field (a JSON array of 0..1 numbers) the client sends for recorded audio. */
export function parseWaveformPeaks(value: unknown): number[] | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const peaks = parsed.slice(0, MAX_WAVEFORM_SAMPLES).filter((n) => typeof n === 'number' && Number.isFinite(n));
    return peaks.length > 0 ? peaks.map((n) => Math.max(0, Math.min(1, n))) : null;
  } catch {
    return null;
  }
}

export function sanitizeFilenameForHeader(name: string): string {
  return name.replace(/[\r\n"]/g, '').trim() || 'attachment';
}

export function attachmentToApi(row: AttachmentRow) {
  return {
    id: row.id,
    noteId: row.noteId,
    kind: row.kind,
    name: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    waveformPeaks: row.waveformPeaks ?? null,
    url: `/api/attachments/${row.id}/file`,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Deletes the on-disk files for every attachment on the given notes. Call this BEFORE deleting
 * the notes themselves — the `attachments` table row cascades away with its note automatically,
 * but that's a DB-only cascade; nothing removes the actual file from ATTACHMENTS_DIR unless we do
 * it here first, which would otherwise leave orphaned files behind on every permanent delete
 * (direct or via the trash auto-purge job).
 */
export async function deleteAttachmentFilesForNotes(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  const rows = await db.select({ storageKey: attachments.storageKey }).from(attachments).where(inArray(attachments.noteId, noteIds));
  await Promise.all(rows.map((row) => localStorageAdapter.delete(row.storageKey)));
}
