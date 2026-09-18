import { Router } from 'express';
import { and, asc, desc, eq, isNull, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, noteLabels, labels, attachments, type ChecklistItem } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { attachmentToApi, deleteAttachmentFilesForNotes, streamToBuffer } from '../lib/attachments.js';
import { VALID_COLORS } from '../lib/colors.js';
import { parseBlocks, blocksFromLegacy, legacyFromBlocks, effectiveBlocks } from '../lib/blocks.js';
import { computeVerifier, decryptBuffer, decryptString, deriveKey, encryptBuffer, encryptString, generateSalt, verifyKey } from '../lib/noteCrypto.js';
import { noteLockRateLimit } from '../middleware/rateLimit.js';
import { localStorageAdapter } from '../storage/localStorageAdapter.js';

const MAX_ITEMS = 300;

function parseChecklistItems(value: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: ChecklistItem[] = [];
  const seenIds = new Set<string>();
  for (const raw of value.slice(0, MAX_ITEMS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, text, checked } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string') continue;
    if (id.length === 0 || id.length > 100 || seenIds.has(id)) continue;
    seenIds.add(id);
    items.push({ id, text: text.slice(0, 500), checked: Boolean(checked) });
  }
  return items;
}

export const notesRouter = Router();
notesRouter.use(requireAuth);

const MAX_PAGE_SIZE = 200;

notesRouter.get('/', async (req, res) => {
  try {
    const { view } = req.query;
    const filters = [eq(notes.userId, req.userId!)];

    const labelParam = req.query.label;
    const labelIds = (Array.isArray(labelParam) ? labelParam : labelParam !== undefined ? [labelParam] : []).filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    const labelMatch = req.query.labelMatch === 'all' ? 'all' : 'any';

    const rawLimit = Number(req.query.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE_SIZE) : undefined;
    const rawOffset = Number(req.query.offset);
    const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    if (labelIds.length > 0) {
      // Only filter by labels the caller actually owns -- a foreign id would otherwise silently
      // narrow the result to nothing.
      const ownedFlags = await Promise.all(labelIds.map((id) => assertOwnsLabel(req.userId!, id)));
      const ownedIds = labelIds.filter((_, i) => ownedFlags[i]);
      if (ownedIds.length === 0) {
        res.json({ notes: [] });
        return;
      }
      const labeledRows = await db
        .select({ noteId: noteLabels.noteId, labelId: noteLabels.labelId })
        .from(noteLabels)
        .where(inArray(noteLabels.labelId, ownedIds));

      let matchingNoteIds: string[];
      if (labelMatch === 'all') {
        const labelsByNote = new Map<string, Set<string>>();
        for (const r of labeledRows) {
          const set = labelsByNote.get(r.noteId) ?? new Set<string>();
          set.add(r.labelId);
          labelsByNote.set(r.noteId, set);
        }
        matchingNoteIds = [...labelsByNote].filter(([, set]) => set.size === ownedIds.length).map(([id]) => id);
      } else {
        matchingNoteIds = [...new Set(labeledRows.map((r) => r.noteId))];
      }

      if (matchingNoteIds.length === 0) {
        res.json({ notes: [] });
        return;
      }
      filters.push(inArray(notes.id, matchingNoteIds), isNull(notes.trashedAt), eq(notes.archived, false));
    } else if (view === 'trash') {
      filters.push(isNotNull(notes.trashedAt));
    } else if (view === 'recordings') {
      filters.push(isNull(notes.trashedAt), eq(notes.isRecording, true));
    } else {
      // Recordings get their own dedicated view (see above) rather than mixing into Notes/Archive.
      filters.push(isNull(notes.trashedAt), eq(notes.isRecording, false));
      if (view === 'archive') {
        filters.push(eq(notes.archived, true));
      } else {
        filters.push(eq(notes.archived, false));
      }
    }

    const baseQuery = db
      .select()
      .from(notes)
      .where(and(...filters))
      .orderBy(desc(notes.pinned), desc(notes.position), desc(notes.updatedAt));
    const rows =
      limit !== undefined
        ? await baseQuery.limit(limit).offset(offset)
        : offset > 0
          ? await baseQuery.offset(offset)
          : await baseQuery;

    const noteIds = rows.map((r) => r.id);
    const labelRows = noteIds.length
      ? await db.select().from(noteLabels).where(inArray(noteLabels.noteId, noteIds))
      : [];

    const labelsByNote = new Map<string, string[]>();
    for (const lr of labelRows) {
      const list = labelsByNote.get(lr.noteId) ?? [];
      list.push(lr.labelId);
      labelsByNote.set(lr.noteId, list);
    }

    const attachmentRows = noteIds.length
      ? await db.select().from(attachments).where(inArray(attachments.noteId, noteIds)).orderBy(asc(attachments.createdAt))
      : [];

    const attachmentsByNote = new Map<string, ReturnType<typeof attachmentToApi>[]>();
    for (const ar of attachmentRows) {
      const list = attachmentsByNote.get(ar.noteId) ?? [];
      list.push(attachmentToApi(ar));
      attachmentsByNote.set(ar.noteId, list);
    }

    res.json({
      notes: rows.map((n) => ({
        ...n,
        blocks: effectiveBlocks(n),
        labelIds: labelsByNote.get(n.id) ?? [],
        // A locked note's attachment filenames/thumbnails are as sensitive as its text -- hide the
        // list entirely rather than only blanking `blocks`, or the grid would still leak them.
        attachments: n.locked ? [] : (attachmentsByNote.get(n.id) ?? []),
      })),
    });
  } catch (err) {
    console.error('List notes failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.post('/', async (req, res) => {
  try {
    const { title, content, color, isChecklist, items, blocks, isRecording } = (req.body ?? {}) as Record<string, unknown>;
    const id = crypto.randomUUID();

    // `blocks` is the canonical field; falling back to the legacy content/items/isChecklist shape
    // keeps an older client working against a newer server during a rolling deploy. Either way,
    // both the new `blocks` column and the shadow-written legacy columns end up populated.
    const parsedBlocks = Array.isArray(blocks) ? (parseBlocks(blocks) ?? []) : undefined;
    const legacy =
      parsedBlocks !== undefined
        ? legacyFromBlocks(parsedBlocks)
        : {
            content: typeof content === 'string' ? content.slice(0, 20000) : '',
            items: parseChecklistItems(items) ?? [],
            isChecklist: Boolean(isChecklist),
          };
    const finalBlocks = parsedBlocks ?? blocksFromLegacy(legacy);

    const [row] = await db
      .insert(notes)
      .values({
        id,
        userId: req.userId!,
        title: typeof title === 'string' ? title.slice(0, 300) : '',
        content: legacy.content,
        isChecklist: legacy.isChecklist,
        items: legacy.items,
        blocks: finalBlocks,
        color: typeof color === 'string' && VALID_COLORS.has(color) ? color : 'default',
        isRecording: Boolean(isRecording),
        position: Date.now(),
      })
      .returning();

    // A brand new note has neither yet -- but the client's Note type requires both fields, and
    // omitting them (the raw `notes` row has no such columns) crashes any render that assumes
    // they're arrays (e.g. `note.attachments.find(...)`) the instant this note lands in the grid.
    res.status(201).json({
      note: { ...row, blocks: effectiveBlocks(row), labelIds: [] as string[], attachments: [] as ReturnType<typeof attachmentToApi>[] },
    });
  } catch (err) {
    console.error('Create note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.patch('/:id', async (req, res) => {
  try {
    const { title, content, color, pinned, archived, isChecklist, items, blocks, position, password } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    const updates: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };

    if (title !== undefined) updates.title = typeof title === 'string' ? title.slice(0, 300) : '';
    if (color !== undefined && typeof color === 'string' && VALID_COLORS.has(color)) updates.color = color;
    if (pinned !== undefined) updates.pinned = Boolean(pinned);
    if (archived !== undefined) updates.archived = Boolean(archived);
    if (typeof position === 'number' && Number.isFinite(position)) updates.position = position;

    const editingBody = Array.isArray(blocks) || content !== undefined || isChecklist !== undefined || items !== undefined;

    if (editingBody) {
      const [current] = await db
        .select({ locked: notes.locked, lockSalt: notes.lockSalt, lockVerifier: notes.lockVerifier })
        .from(notes)
        .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
        .limit(1);
      if (!current) {
        res.status(404).json({ error: 'Note not found.' });
        return;
      }

      if (current.locked) {
        // No server-side "unlocked" session state -- every edit to a locked note's body must
        // re-supply the password, which is re-verified and used to re-encrypt on every save.
        if (typeof password !== 'string') {
          res.status(401).json({ error: 'This note is locked. Enter its password to save changes.' });
          return;
        }
        const key = await deriveKey(password, Buffer.from(current.lockSalt!, 'base64'));
        if (!verifyKey(key, Buffer.from(current.lockVerifier!, 'base64'))) {
          res.status(401).json({ error: 'Incorrect password.' });
          return;
        }
        if (Array.isArray(blocks)) {
          const parsed = parseBlocks(blocks) ?? [];
          const payload = encryptString(key, JSON.stringify(parsed));
          updates.encryptedBlocks = payload.ciphertext;
          updates.lockIv = payload.iv;
          updates.lockAuthTag = payload.authTag;
          // `blocks`/`content`/`items` are left at their locked-empty values -- a locked note's
          // plaintext must never land in any column other than the encrypted one.
        }
      } else if (Array.isArray(blocks)) {
        // `blocks` is the canonical field going forward; shadow-write the legacy columns too so a
        // rollback to the pre-blocks server binary still has correct content/items to read.
        const parsed = parseBlocks(blocks);
        if (parsed) {
          updates.blocks = parsed;
          const legacy = legacyFromBlocks(parsed);
          updates.content = legacy.content;
          updates.items = legacy.items;
          updates.isChecklist = legacy.isChecklist;
        }
      } else {
        // Older client sending the legacy fields directly (rolling-deploy compatibility only -- our
        // own frontend always sends `blocks`). Partial legacy patches (e.g. content alone) can't be
        // safely re-derived into `blocks` without the row's other current fields, so `blocks` is
        // left untouched here; it stays in sync once the client sends `blocks` for this note.
        if (content !== undefined) updates.content = typeof content === 'string' ? content.slice(0, 20000) : '';
        if (isChecklist !== undefined) updates.isChecklist = Boolean(isChecklist);
        if (items !== undefined) {
          const parsed = parseChecklistItems(items);
          if (parsed) updates.items = parsed;
        }
      }
    }

    const [row] = await db
      .update(notes)
      .set(updates)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    // Unlike POST, an existing note can already have attachments/labels attached from before this
    // edit -- has to actually look them up (same as the list route) rather than assuming empty,
    // or a client that trusted this response would silently wipe them from view.
    const [labelRows, attachmentRows] = await Promise.all([
      db.select({ labelId: noteLabels.labelId }).from(noteLabels).where(eq(noteLabels.noteId, row.id)),
      db.select().from(attachments).where(eq(attachments.noteId, row.id)).orderBy(asc(attachments.createdAt)),
    ]);

    res.json({
      note: {
        ...row,
        blocks: effectiveBlocks(row),
        labelIds: labelRows.map((lr) => lr.labelId),
        attachments: row.locked ? [] : attachmentRows.map(attachmentToApi),
      },
    });
  } catch (err) {
    console.error('Update note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

const MIN_LOCK_PASSWORD_LENGTH = 4;

notesRouter.post('/:id/lock', noteLockRateLimit, async (req, res) => {
  try {
    const { password, blocks, title } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof password !== 'string' || password.length < MIN_LOCK_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Choose a password with at least ${MIN_LOCK_PASSWORD_LENGTH} characters.` });
      return;
    }
    const [current] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    if (current.locked) {
      res.status(400).json({ error: 'This note is already locked.' });
      return;
    }

    const salt = generateSalt();
    const key = await deriveKey(password, salt);
    // A client locking a note it currently has open may have in-progress edits that were never
    // PATCHed (the modal only saves on close) -- accepting `blocks`/`title` here directly lets
    // "Lock" encrypt exactly what's on screen in one step, instead of racing a separate save.
    const plaintextBlocks = Array.isArray(blocks) ? (parseBlocks(blocks) ?? []) : effectiveBlocks(current);
    const payload = encryptString(key, JSON.stringify(plaintextBlocks));

    // Encrypt every attachment's file bytes in place under the same key -- a locked note's photos
    // and recordings need the same protection as its text, not just the blocks column.
    const attachmentRows = await db.select().from(attachments).where(eq(attachments.noteId, current.id));
    for (const attachment of attachmentRows) {
      const file = await localStorageAdapter.read(attachment.storageKey);
      if (!file) continue;
      const plaintext = await streamToBuffer(file.stream);
      const { iv, ciphertext, authTag } = encryptBuffer(key, plaintext);
      await localStorageAdapter.save(attachment.storageKey, ciphertext);
      await db
        .update(attachments)
        .set({ encIv: iv.toString('base64'), encAuthTag: authTag.toString('base64') })
        .where(eq(attachments.id, attachment.id));
    }

    const [row] = await db
      .update(notes)
      .set({
        ...(typeof title === 'string' ? { title: title.slice(0, 300) } : {}),
        locked: true,
        lockSalt: salt.toString('base64'),
        lockVerifier: computeVerifier(key).toString('base64'),
        lockIv: payload.iv,
        lockAuthTag: payload.authTag,
        encryptedBlocks: payload.ciphertext,
        blocks: [],
        content: '',
        items: [],
        isChecklist: false,
        updatedAt: new Date(),
      })
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    const labelRows = await db.select({ labelId: noteLabels.labelId }).from(noteLabels).where(eq(noteLabels.noteId, row.id));
    res.json({ note: { ...row, blocks: effectiveBlocks(row), labelIds: labelRows.map((lr) => lr.labelId), attachments: [] } });
  } catch (err) {
    console.error('Lock note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.post('/:id/unlock', noteLockRateLimit, async (req, res) => {
  try {
    const { password } = (req.body ?? {}) as Record<string, unknown>;
    const [current] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    if (!current.locked) {
      res.status(400).json({ error: 'This note is not locked.' });
      return;
    }
    if (typeof password !== 'string') {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const key = await deriveKey(password, Buffer.from(current.lockSalt!, 'base64'));
    if (!verifyKey(key, Buffer.from(current.lockVerifier!, 'base64'))) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    // Read-only: decrypts and returns the plaintext blocks for this one response, but never
    // persists them or flips `locked` -- there is no server-side "unlocked" session state, so
    // every subsequent read/edit of this note's body must go through unlock/PATCH again.
    const decrypted = decryptString(key, {
      ciphertext: current.encryptedBlocks!,
      iv: current.lockIv!,
      authTag: current.lockAuthTag!,
    });
    const blocks = parseBlocks(JSON.parse(decrypted)) ?? [];

    // Attachment metadata too -- GET /api/notes never includes it for a locked note (see the list
    // route), so this is the client's only way to learn what attachments exist. Each one's actual
    // bytes still need a separate per-attachment password check (POST .../unlock-attachment/:id);
    // the `url` here is the normal (locked-blocking) one and is not usable until then.
    const attachmentRows = await db.select().from(attachments).where(eq(attachments.noteId, current.id)).orderBy(asc(attachments.createdAt));

    res.json({ blocks, attachments: attachmentRows.map(attachmentToApi) });
  } catch (err) {
    console.error('Unlock note failed:', err);
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

notesRouter.post('/:id/unlock-attachment/:attachmentId', noteLockRateLimit, async (req, res) => {
  try {
    const { password } = (req.body ?? {}) as Record<string, unknown>;
    const [current] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .limit(1);
    if (!current || !current.locked) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    if (typeof password !== 'string') {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }
    const key = await deriveKey(password, Buffer.from(current.lockSalt!, 'base64'));
    if (!verifyKey(key, Buffer.from(current.lockVerifier!, 'base64'))) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    const [attachment] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, req.params.attachmentId), eq(attachments.noteId, current.id)))
      .limit(1);
    if (!attachment || !attachment.encIv || !attachment.encAuthTag) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    const file = await localStorageAdapter.read(attachment.storageKey);
    if (!file) {
      res.status(404).json({ error: 'Attachment file not found.' });
      return;
    }
    const ciphertext = await streamToBuffer(file.stream);
    const plaintext = decryptBuffer(key, Buffer.from(attachment.encIv, 'base64'), ciphertext, Buffer.from(attachment.encAuthTag, 'base64'));

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(plaintext);
  } catch (err) {
    console.error('Unlock attachment failed:', err);
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

notesRouter.post('/:id/remove-lock', noteLockRateLimit, async (req, res) => {
  try {
    const { password } = (req.body ?? {}) as Record<string, unknown>;
    const [current] = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    if (!current.locked) {
      res.status(400).json({ error: 'This note is not locked.' });
      return;
    }
    if (typeof password !== 'string') {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }

    const key = await deriveKey(password, Buffer.from(current.lockSalt!, 'base64'));
    if (!verifyKey(key, Buffer.from(current.lockVerifier!, 'base64'))) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    const decrypted = decryptString(key, {
      ciphertext: current.encryptedBlocks!,
      iv: current.lockIv!,
      authTag: current.lockAuthTag!,
    });
    const blocks = parseBlocks(JSON.parse(decrypted)) ?? [];
    const legacy = legacyFromBlocks(blocks);

    const attachmentRows = await db.select().from(attachments).where(eq(attachments.noteId, current.id));
    for (const attachment of attachmentRows) {
      if (!attachment.encIv || !attachment.encAuthTag) continue;
      const file = await localStorageAdapter.read(attachment.storageKey);
      if (!file) continue;
      const ciphertext = await streamToBuffer(file.stream);
      const plaintext = decryptBuffer(key, Buffer.from(attachment.encIv, 'base64'), ciphertext, Buffer.from(attachment.encAuthTag, 'base64'));
      await localStorageAdapter.save(attachment.storageKey, plaintext);
      await db.update(attachments).set({ encIv: null, encAuthTag: null }).where(eq(attachments.id, attachment.id));
    }

    const [row] = await db
      .update(notes)
      .set({
        locked: false,
        lockSalt: null,
        lockVerifier: null,
        lockIv: null,
        lockAuthTag: null,
        encryptedBlocks: null,
        blocks,
        content: legacy.content,
        items: legacy.items,
        isChecklist: legacy.isChecklist,
        updatedAt: new Date(),
      })
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    const [labelRows, unlockedAttachmentRows] = await Promise.all([
      db.select({ labelId: noteLabels.labelId }).from(noteLabels).where(eq(noteLabels.noteId, row.id)),
      db.select().from(attachments).where(eq(attachments.noteId, row.id)).orderBy(asc(attachments.createdAt)),
    ]);
    res.json({
      note: {
        ...row,
        blocks: effectiveBlocks(row),
        labelIds: labelRows.map((lr) => lr.labelId),
        attachments: unlockedAttachmentRows.map(attachmentToApi),
      },
    });
  } catch (err) {
    console.error('Remove note lock failed:', err);
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

notesRouter.post('/:id/trash', async (req, res) => {
  try {
    const [row] = await db
      .update(notes)
      .set({ trashedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    res.json({ note: { ...row, blocks: effectiveBlocks(row) } });
  } catch (err) {
    console.error('Trash note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.post('/:id/restore', async (req, res) => {
  try {
    const [row] = await db
      .update(notes)
      .set({ trashedAt: null, updatedAt: new Date() })
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    res.json({ note: { ...row, blocks: effectiveBlocks(row) } });
  } catch (err) {
    console.error('Restore note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.delete('/:id', async (req, res) => {
  try {
    if (!(await assertOwnsNote(req.userId!, req.params.id))) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    // Must run before the note row is deleted -- the attachments row cascades away with it at the
    // DB level, but nothing else would clean up the actual file on disk.
    await deleteAttachmentFilesForNotes([req.params.id]);
    await db.delete(notes).where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)));
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

async function assertOwnsNote(userId: string, noteId: string): Promise<boolean> {
  const rows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function assertOwnsLabel(userId: string, labelId: string): Promise<boolean> {
  const rows = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

notesRouter.put('/:id/labels/:labelId', async (req, res) => {
  try {
    if (!(await assertOwnsNote(req.userId!, req.params.id)) || !(await assertOwnsLabel(req.userId!, req.params.labelId))) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    await db
      .insert(noteLabels)
      .values({ noteId: req.params.id, labelId: req.params.labelId })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    console.error('Attach label failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.delete('/:id/labels/:labelId', async (req, res) => {
  try {
    if (!(await assertOwnsNote(req.userId!, req.params.id)) || !(await assertOwnsLabel(req.userId!, req.params.labelId))) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    await db
      .delete(noteLabels)
      .where(and(eq(noteLabels.noteId, req.params.id), eq(noteLabels.labelId, req.params.labelId)));
    res.json({ ok: true });
  } catch (err) {
    console.error('Detach label failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
