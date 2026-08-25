import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { labels } from '../db/schema.js';
import { requireAuth } from '../middleware/session.js';
import { VALID_COLORS } from '../lib/colors.js';

const UNIQUE_VIOLATION = '23505';
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export const labelsRouter = Router();
labelsRouter.use(requireAuth);

labelsRouter.get('/', async (req, res) => {
  try {
    const rows = await db.select().from(labels).where(eq(labels.userId, req.userId!)).orderBy(labels.name);
    res.json({ labels: rows });
  } catch (err) {
    console.error('List labels failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

labelsRouter.post('/', async (req, res) => {
  try {
    const { name, color } = (req.body ?? {}) as Record<string, unknown>;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > 50) {
      res.json({ label: null, error: 'Label name must be 1-50 characters.' });
      return;
    }

    const [row] = await db
      .insert(labels)
      .values({
        id: crypto.randomUUID(),
        userId: req.userId!,
        name: trimmed,
        color: typeof color === 'string' && VALID_COLORS.has(color) ? color : 'default',
      })
      .returning();
    res.status(201).json({ label: row });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.json({ label: null, error: 'A label with this name already exists.' });
      return;
    }
    console.error('Create label failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

labelsRouter.patch('/:id', async (req, res) => {
  try {
    const { name, color } = (req.body ?? {}) as Record<string, unknown>;
    const updates: { name?: string; color?: string } = {};

    if (name !== undefined) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed || trimmed.length > 50) {
        res.json({ label: null, error: 'Label name must be 1-50 characters.' });
        return;
      }
      updates.name = trimmed;
    }
    if (color !== undefined && typeof color === 'string' && VALID_COLORS.has(color)) updates.color = color;

    const [row] = await db
      .update(labels)
      .set(updates)
      .where(and(eq(labels.id, req.params.id), eq(labels.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Label not found.' });
      return;
    }
    res.json({ label: row });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.json({ label: null, error: 'A label with this name already exists.' });
      return;
    }
    console.error('Update label failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

labelsRouter.delete('/:id', async (req, res) => {
  try {
    const [row] = await db
      .delete(labels)
      .where(and(eq(labels.id, req.params.id), eq(labels.userId, req.userId!)))
      .returning();

    if (!row) {
      res.status(404).json({ error: 'Label not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete label failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
