import type { NoteBlock } from '../types';

// A contentEditable left "empty" by the user can still hold a stray <br> or empty block element
// (a well-known browser quirk), so a plain string emptiness/whitespace check on its HTML isn't
// reliable -- this checks the actual rendered text plus whether an image was inserted instead.
export function isRichContentEmpty(html: string): boolean {
  if (!html.trim()) return true;
  const container = document.createElement('div');
  container.innerHTML = html;
  if (container.querySelector('img')) return false;
  return (container.textContent ?? '').trim().length === 0;
}

/** A note is empty when every block is: an empty text block, or a checklist block with no
 *  non-blank items. Used to decide whether a closed composer/draft has anything worth saving. */
export function isBlocksEmpty(blocks: NoteBlock[]): boolean {
  return blocks.every((b) => (b.type === 'text' ? isRichContentEmpty(b.html) : b.items.every((i) => i.text.trim().length === 0)));
}
