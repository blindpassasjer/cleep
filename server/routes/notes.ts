import { Router } from 'express';
import { and, asc, desc, eq, isNull, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, noteLabels, labels, attachments, type ChecklistItem } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { attachmentToApi, deleteAttachmentFilesForNotes } from '../lib/attachments.js';

const MAX_ITEMS = 300;

function parseChecklistItems(value: unknown): ChecklistItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: ChecklistItem[] = [];
  for (const raw of value.slice(0, MAX_ITEMS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, text, checked } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string') continue;
    items.push({ id, text: text.slice(0, 500), checked: Boolean(checked) });
  }
  return items;
}

export const notesRouter = Router();
notesRouter.use(requireAuth);

const VALID_COLORS = new Set([
  'default',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'brown',
  'gray',
]);

notesRouter.get('/', async (req, res) => {
  try {
    const { view, label } = req.query;
    const filters = [eq(notes.userId, req.userId!)];

    if (typeof label === 'string' && label) {
      const labeledRows = await db.select({ noteId: noteLabels.noteId }).from(noteLabels).where(eq(noteLabels.labelId, label));
      const noteIds = labeledRows.map((r) => r.noteId);
      if (noteIds.length === 0) {
        res.json({ notes: [] });
        return;
      }
      filters.push(inArray(notes.id, noteIds), isNull(notes.trashedAt), eq(notes.archived, false));
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

    const rows = await db
      .select()
      .from(notes)
      .where(and(...filters))
      .orderBy(desc(notes.pinned), desc(notes.position), desc(notes.updatedAt));

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
        labelIds: labelsByNote.get(n.id) ?? [],
        attachments: attachmentsByNote.get(n.id) ?? [],
      })),
    });
  } catch (err) {
    console.error('List notes failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.post('/', async (req, res) => {
  try {
    const { title, content, color, isChecklist, items, isRecording } = (req.body ?? {}) as Record<string, unknown>;
    const id = crypto.randomUUID();

    const [row] = await db
      .insert(notes)
      .values({
        id,
        userId: req.userId!,
        title: typeof title === 'string' ? title.slice(0, 300) : '',
        content: typeof content === 'string' ? content.slice(0, 20000) : '',
        color: typeof color === 'string' && VALID_COLORS.has(color) ? color : 'default',
        isChecklist: Boolean(isChecklist),
        items: parseChecklistItems(items) ?? [],
        isRecording: Boolean(isRecording),
        position: Date.now(),
      })
      .returning();

    res.status(201).json({ note: row });
  } catch (err) {
    console.error('Create note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.patch('/:id', async (req, res) => {
  try {
    const { title, content, color, pinned, archived, isChecklist, items, position } = (req.body ?? {}) as Record<string, unknown>;
    const updates: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };

    if (title !== undefined) updates.title = typeof title === 'string' ? title.slice(0, 300) : '';
    if (content !== undefined) updates.content = typeof content === 'string' ? content.slice(0, 20000) : '';
    if (color !== undefined && typeof color === 'string' && VALID_COLORS.has(color)) updates.color = color;
    if (pinned !== undefined) updates.pinned = Boolean(pinned);
    if (archived !== undefined) updates.archived = Boolean(archived);
    if (isChecklist !== undefined) updates.isChecklist = Boolean(isChecklist);
    if (items !== undefined) {
      const parsed = parseChecklistItems(items);
      if (parsed) updates.items = parsed;
    }
    if (typeof position === 'number' && Number.isFinite(position)) updates.position = position;

    const [row] = await db
      .update(notes)
      .set(updates)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.json({ note: row });
  } catch (err) {
    console.error('Update note failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
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
    res.json({ note: row });
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
    res.json({ note: row });
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
