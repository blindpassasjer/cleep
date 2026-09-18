import type { ChecklistItem, ChecklistBlock, NoteBlock, TextBlock } from '../db/schema.js';

const MAX_BLOCKS = 200;
const MAX_HTML_LENGTH = 20000;
const MAX_ITEMS_PER_BLOCK = 300;
const MAX_TOTAL_SERIALIZED_LENGTH = 200000;

function parseChecklistItems(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const items: ChecklistItem[] = [];
  const seenIds = new Set<string>();
  for (const raw of value.slice(0, MAX_ITEMS_PER_BLOCK)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, text, checked } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string') continue;
    if (id.length === 0 || id.length > 100 || seenIds.has(id)) continue;
    seenIds.add(id);
    items.push({ id, text: text.slice(0, 500), checked: Boolean(checked) });
  }
  return items;
}

/** Validates/sanitizes a client-supplied `blocks` array, dropping malformed entries rather than
 *  rejecting the whole request -- matches the existing leniency of `parseChecklistItems` in
 *  server/routes/notes.ts. Returns undefined only when `value` isn't even an array. */
export function parseBlocks(value: unknown): NoteBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks: NoteBlock[] = [];
  const seenIds = new Set<string>();
  for (const raw of value.slice(0, MAX_BLOCKS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, type } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0 || id.length > 100 || seenIds.has(id)) continue;
    if (type === 'text') {
      const html = (raw as Record<string, unknown>).html;
      if (typeof html !== 'string') continue;
      seenIds.add(id);
      blocks.push({ id, type: 'text', html: html.slice(0, MAX_HTML_LENGTH) });
    } else if (type === 'checklist') {
      seenIds.add(id);
      blocks.push({ id, type: 'checklist', items: parseChecklistItems((raw as Record<string, unknown>).items) });
    }
  }
  if (JSON.stringify(blocks).length > MAX_TOTAL_SERIALIZED_LENGTH) {
    return blocks.slice(0, 1);
  }
  return blocks;
}

/** Wraps a legacy note's single content/items pair into a one-block array -- used for the
 *  one-time backfill and for any client still sending the old fields during a rolling deploy. */
export function blocksFromLegacy(row: { content: string; items: ChecklistItem[]; isChecklist: boolean }): NoteBlock[] {
  if (row.isChecklist) {
    const block: ChecklistBlock = { id: crypto.randomUUID(), type: 'checklist', items: row.items };
    return [block];
  }
  const block: TextBlock = { id: crypto.randomUUID(), type: 'text', html: row.content };
  return [block];
}

/** Rows written before the one-time backfill script runs (server/db/backfillBlocks.ts) still have
 *  `blocks: []` even though their legacy content/items/isChecklist columns are populated -- derive
 *  blocks on the fly wherever a note is read, so results are correct immediately without depending
 *  on the backfill having already run. A locked note also has `blocks: []` (its real content lives
 *  only in `encryptedBlocks`), but that's not a "not backfilled yet" row -- it must resolve to `[]`
 *  (no plaintext available), never to a fabricated empty block from the also-blank legacy columns. */
export function effectiveBlocks(row: {
  blocks: NoteBlock[];
  content: string;
  items: ChecklistItem[];
  isChecklist: boolean;
  locked: boolean;
}): NoteBlock[] {
  if (row.locked) return [];
  return row.blocks.length > 0 ? row.blocks : blocksFromLegacy(row);
}

/** Best-effort collapse of a blocks array back into the legacy content/items/isChecklist shape,
 *  used only to keep those columns shadow-written during the migration window. Exactly reversible
 *  for the common single-block case; multi-block notes degrade by concatenation, which is
 *  acceptable since that shape is new content the legacy columns were never meant to represent. */
export function legacyFromBlocks(blocks: NoteBlock[]): { content: string; items: ChecklistItem[]; isChecklist: boolean } {
  if (blocks.length === 1 && blocks[0].type === 'checklist') {
    return { content: '', items: blocks[0].items, isChecklist: true };
  }
  const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text');
  const checklistBlocks = blocks.filter((b): b is ChecklistBlock => b.type === 'checklist');
  return {
    content: textBlocks.map((b) => b.html).join('<div><br></div>'),
    items: checklistBlocks.flatMap((b) => b.items),
    isChecklist: false,
  };
}
