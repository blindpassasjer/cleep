import { Router } from 'express';
import { and, desc, eq, isNull, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, noteLabels } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';

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
    const { view } = req.query;
    const filters = [eq(notes.userId, req.userId!)];

    if (view === 'trash') {
      filters.push(isNotNull(notes.trashedAt));
    } else {
      filters.push(isNull(notes.trashedAt));
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

    res.json({ notes: rows.map((n) => ({ ...n, labelIds: labelsByNote.get(n.id) ?? [] })) });
  } catch (err) {
    console.error('List notes failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

notesRouter.post('/', async (req, res) => {
  try {
    const { title, content, color } = (req.body ?? {}) as Record<string, unknown>;
    const id = crypto.randomUUID();

    const [row] = await db
      .insert(notes)
      .values({
        id,
        userId: req.userId!,
        title: typeof title === 'string' ? title.slice(0, 300) : '',
        content: typeof content === 'string' ? content.slice(0, 20000) : '',
        color: typeof color === 'string' && VALID_COLORS.has(color) ? color : 'default',
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
    const { title, content, color, pinned, archived } = (req.body ?? {}) as Record<string, unknown>;
    const updates: Partial<typeof notes.$inferInsert> = { updatedAt: new Date() };

    if (title !== undefined) updates.title = typeof title === 'string' ? title.slice(0, 300) : '';
    if (content !== undefined) updates.content = typeof content === 'string' ? content.slice(0, 20000) : '';
    if (color !== undefined && typeof color === 'string' && VALID_COLORS.has(color)) updates.color = color;
    if (pinned !== undefined) updates.pinned = Boolean(pinned);
    if (archived !== undefined) updates.archived = Boolean(archived);

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
    const [row] = await db
      .delete(notes)
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
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

notesRouter.put('/:id/labels/:labelId', async (req, res) => {
  try {
    if (!(await assertOwnsNote(req.userId!, req.params.id))) {
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
    if (!(await assertOwnsNote(req.userId!, req.params.id))) {
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
