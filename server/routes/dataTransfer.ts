import type { Readable } from 'node:stream';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import multer from 'multer';
import { db } from '../db/client.js';
import { notes, noteLabels, labels, attachments, type ChecklistItem } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { uploadRateLimit } from '../middleware/rateLimit.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';
import { kindFromMime, sanitizeFilenameForPath } from '../lib/attachments.js';
import { VALID_COLORS } from '../lib/colors.js';

export const dataTransferRouter = Router();
dataTransferRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Export -- GET /api/export
// ---------------------------------------------------------------------------

dataTransferRouter.get('/export', uploadRateLimit, async (req, res) => {
  try {
    const userId = req.userId!;
    const [noteRows, labelRows] = await Promise.all([
      db.select().from(notes).where(eq(notes.userId, userId)).orderBy(asc(notes.createdAt)),
      db.select().from(labels).where(eq(labels.userId, userId)).orderBy(asc(labels.name)),
    ]);
    const noteIds = noteRows.map((n) => n.id);
    const [noteLabelRows, attachmentRows] = await Promise.all([
      noteIds.length ? db.select().from(noteLabels).where(inArray(noteLabels.noteId, noteIds)) : Promise.resolve([]),
      noteIds.length
        ? db.select().from(attachments).where(inArray(attachments.noteId, noteIds)).orderBy(asc(attachments.createdAt))
        : Promise.resolve([]),
    ]);

    const labelsByNote = new Map<string, string[]>();
    for (const lr of noteLabelRows) {
      const list = labelsByNote.get(lr.noteId) ?? [];
      list.push(lr.labelId);
      labelsByNote.set(lr.noteId, list);
    }
    const attachmentsByNote = new Map<string, typeof attachmentRows>();
    for (const ar of attachmentRows) {
      const list = attachmentsByNote.get(ar.noteId) ?? [];
      list.push(ar);
      attachmentsByNote.set(ar.noteId, list);
    }

    const exportNotes = noteRows.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      isChecklist: n.isChecklist,
      items: n.items,
      color: n.color,
      pinned: n.pinned,
      archived: n.archived,
      isRecording: n.isRecording,
      trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      labelIds: labelsByNote.get(n.id) ?? [],
      attachments: (attachmentsByNote.get(n.id) ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        path: `attachments/${a.noteId}/${a.id}-${sanitizeFilenameForPath(a.originalName)}`,
      })),
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    res.attachment(`cleep-export-${stamp}.zip`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (err) => console.warn('Export archive warning:', err));
    archive.on('error', (err) => {
      console.error('Export archive failed:', err);
      res.destroy(err);
    });
    archive.pipe(res);

    archive.append(JSON.stringify({ format: 1, app: 'cleep', exportedAt: new Date().toISOString() }, null, 2), {
      name: 'manifest.json',
    });
    archive.append(JSON.stringify(exportNotes, null, 2), { name: 'notes.json' });
    archive.append(
      JSON.stringify(
        labelRows.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        null,
        2,
      ),
      { name: 'labels.json' },
    );

    for (const note of exportNotes) {
      for (let i = 0; i < note.attachments.length; i++) {
        const meta = note.attachments[i];
        const row = (attachmentsByNote.get(note.id) ?? [])[i];
        if (!row) continue;
        const file = await localStorageAdapter.read(row.storageKey);
        if (file) archive.append(file.stream as Readable, { name: meta.path });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Export failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// Import from Google Keep (Takeout) -- POST /api/import/keep
// ---------------------------------------------------------------------------

const MAX_IMPORT_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_IMPORT_NOTES = 5000;

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_ZIP_BYTES },
});

function uploadZip(req: Request, res: Response, next: NextFunction): void {
  importUpload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: `File is too large. Maximum size is ${MAX_IMPORT_ZIP_BYTES / (1024 * 1024)}MB.` });
      return;
    }
    console.error('Import upload failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
}

// Google Keep's color enum -> Cleep's VALID_COLORS.
const KEEP_COLOR_MAP: Record<string, string> = {
  DEFAULT: 'default',
  RED: 'red',
  ORANGE: 'orange',
  YELLOW: 'yellow',
  GREEN: 'green',
  TEAL: 'teal',
  BLUE: 'blue',
  DARKBLUE: 'blue',
  CERULEAN: 'blue',
  PURPLE: 'purple',
  PINK: 'pink',
  BROWN: 'brown',
  GRAY: 'gray',
};

interface KeepNote {
  title?: string;
  textContent?: string;
  textContentHtml?: string;
  listContent?: { text?: string; isChecked?: boolean }[];
  color?: string;
  isArchived?: boolean;
  isTrashed?: boolean;
  isPinned?: boolean;
  labels?: { name?: string }[];
  attachments?: { filePath?: string; mimetype?: string }[];
  userEditedTimestampUsec?: number;
  createdTimestampUsec?: number;
}

function usecToDate(usec: unknown): Date | null {
  if (typeof usec !== 'number' || !Number.isFinite(usec) || usec <= 0) return null;
  const d = new Date(usec / 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

dataTransferRouter.post('/import/keep', uploadRateLimit, uploadZip, async (req, res) => {
  const userId = req.userId!;
  if (!req.file) {
    res.status(400).json({ error: 'No file provided.' });
    return;
  }

  let directory: Awaited<ReturnType<typeof unzipper.Open.buffer>>;
  try {
    directory = await unzipper.Open.buffer(req.file.buffer);
  } catch {
    res.status(400).json({ error: 'That does not look like a valid .zip file.' });
    return;
  }

  // Index every media file by basename for attachment lookups.
  const mediaByName = new Map<string, (typeof directory.files)[number]>();
  const keepJsonFiles: (typeof directory.files)[number][] = [];
  for (const f of directory.files) {
    if (f.type !== 'File') continue;
    const lower = f.path.toLowerCase();
    if (lower.endsWith('.json') && /(^|\/)keep\//.test(lower)) keepJsonFiles.push(f);
    else mediaByName.set(basename(f.path), f);
  }

  if (keepJsonFiles.length === 0) {
    res.status(400).json({ error: 'No Google Keep notes found in that archive (expected Takeout/Keep/*.json).' });
    return;
  }
  if (keepJsonFiles.length > MAX_IMPORT_NOTES) {
    res.status(400).json({ error: `Archive contains more than ${MAX_IMPORT_NOTES} notes.` });
    return;
  }

  // Pre-load existing labels so we can dedupe by name.
  const existingLabels = await db.select().from(labels).where(eq(labels.userId, userId));
  const labelIdByName = new Map<string, string>();
  for (const l of existingLabels) labelIdByName.set(l.name.toLowerCase(), l.id);

  async function ensureLabel(rawName: string): Promise<string | null> {
    const name = rawName.trim().slice(0, 50);
    if (!name) return null;
    const key = name.toLowerCase();
    const existing = labelIdByName.get(key);
    if (existing) return existing;
    try {
      const [row] = await db
        .insert(labels)
        .values({ id: crypto.randomUUID(), userId, name, color: 'default' })
        .returning();
      labelIdByName.set(key, row.id);
      return row.id;
    } catch {
      // Unique-violation race or similar -- re-read.
      const [row] = await db
        .select()
        .from(labels)
        .where(and(eq(labels.userId, userId), eq(labels.name, name)))
        .limit(1);
      if (row) {
        labelIdByName.set(key, row.id);
        return row.id;
      }
      return null;
    }
  }

  const errors: string[] = [];
  let imported = 0;
  let skippedTrashed = 0;

  for (const jsonFile of keepJsonFiles) {
    let parsed: KeepNote;
    try {
      parsed = JSON.parse((await jsonFile.buffer()).toString('utf8')) as KeepNote;
    } catch {
      errors.push(`Could not parse ${basename(jsonFile.path)}`);
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    if (parsed.isTrashed) {
      skippedTrashed++;
      continue;
    }

    try {
      const isChecklist = Array.isArray(parsed.listContent) && parsed.listContent.length > 0;
      const items: ChecklistItem[] = isChecklist
        ? parsed
            .listContent!.slice(0, 300)
            .filter((it) => typeof it?.text === 'string')
            .map((it) => ({ id: crypto.randomUUID(), text: String(it.text).slice(0, 500), checked: Boolean(it.isChecked) }))
        : [];
      const color = KEEP_COLOR_MAP[String(parsed.color ?? 'DEFAULT').toUpperCase()] ?? 'default';
      const edited = usecToDate(parsed.userEditedTimestampUsec);
      const created = usecToDate(parsed.createdTimestampUsec) ?? edited ?? new Date();

      const noteId = crypto.randomUUID();
      const noteLabelIds: string[] = [];
      for (const l of parsed.labels ?? []) {
        if (typeof l?.name === 'string') {
          const id = await ensureLabel(l.name);
          if (id && !noteLabelIds.includes(id)) noteLabelIds.push(id);
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(notes).values({
          id: noteId,
          userId,
          title: typeof parsed.title === 'string' ? parsed.title.slice(0, 300) : '',
          content: isChecklist ? '' : typeof parsed.textContent === 'string' ? parsed.textContent.slice(0, 20000) : '',
          isChecklist,
          items,
          color: VALID_COLORS.has(color) ? color : 'default',
          pinned: Boolean(parsed.isPinned),
          archived: Boolean(parsed.isArchived),
          position: created.getTime(),
          createdAt: created,
          updatedAt: edited ?? created,
        });
        if (noteLabelIds.length) {
          await tx.insert(noteLabels).values(noteLabelIds.map((labelId) => ({ noteId, labelId })));
        }
      });

      // Attachment files are written after the row commit so a failure here can't orphan a note.
      for (const att of parsed.attachments ?? []) {
        const fp = typeof att?.filePath === 'string' ? att.filePath : '';
        if (!fp) continue;
        const media = mediaByName.get(basename(fp));
        if (!media) {
          errors.push(`Missing attachment "${basename(fp)}" for note "${parsed.title || noteId}"`);
          continue;
        }
        const buf = await media.buffer();
        const mime = typeof att.mimetype === 'string' && att.mimetype ? att.mimetype : guessMime(fp);
        const kind = kindFromMime(mime);
        if (!kind) {
          errors.push(`Unsupported attachment type "${mime}" for note "${parsed.title || noteId}"`);
          continue;
        }
        const attId = crypto.randomUUID();
        const originalName = basename(fp);
        const storageKey = `${userId}/${noteId}/${attId}-${sanitizeFilenameForPath(originalName)}`;
        await localStorageAdapter.save(storageKey, buf);
        await db.insert(attachments).values({
          id: attId,
          noteId,
          userId,
          kind,
          originalName,
          storageKey,
          mimeType: mime,
          sizeBytes: buf.length,
          waveformPeaks: null,
        });
      }

      imported++;
    } catch (err) {
      console.error('Import note failed:', err);
      errors.push(`Failed to import "${parsed.title || basename(jsonFile.path)}"`);
    }
  }

  res.json({ imported, skippedTrashed, errors: errors.slice(0, 50) });
});

function guessMime(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    '3gp': 'audio/3gpp',
    amr: 'audio/amr',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
  };
  return map[ext] ?? 'application/octet-stream';
}
