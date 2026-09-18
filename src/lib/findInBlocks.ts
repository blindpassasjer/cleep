import { stripHtmlToText } from './stripHtmlToText';
import type { NoteBlock } from '../types';

export interface BlockMatch {
  blockId: string;
  blockType: 'text' | 'checklist';
  /** Set only for a checklist match -- identifies which item within the block. */
  itemId?: string;
  /** Character offset into the block's plain text (text blocks) or the item's text (checklist). */
  start: number;
  length: number;
}

function findAll(haystack: string, needle: string): number[] {
  const offsets: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    offsets.push(idx);
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return offsets;
}

/** Scans a note's blocks for every case-insensitive occurrence of `query`, in block order (and,
 *  within a checklist block, in item order) -- text blocks are matched against their rendered
 *  text (see stripHtmlToText), checklist blocks against each item's plain text directly. */
export function findMatches(blocks: NoteBlock[], query: string): BlockMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: BlockMatch[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      const text = stripHtmlToText(block.html).toLowerCase();
      for (const start of findAll(text, q)) {
        matches.push({ blockId: block.id, blockType: 'text', start, length: q.length });
      }
    } else {
      for (const item of block.items) {
        const text = item.text.toLowerCase();
        for (const start of findAll(text, q)) {
          matches.push({ blockId: block.id, blockType: 'checklist', itemId: item.id, start, length: q.length });
        }
      }
    }
  }
  return matches;
}
