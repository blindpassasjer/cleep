// Lossless conversion between a note's rich-text body and its checklist items, so the note/list
// choice made at creation is never final -- the same content can be flipped either way from the
// open note, the way Google Keep's "Show/Hide checkboxes" works. Splitting is line-based: every
// non-empty line of the body becomes one item, and hiding the checkboxes joins the items back
// into text one per line. Checked items keep their text across the round trip.
import { orderChecklistItems } from './orderChecklistItems';
import { sanitizeHtml } from './sanitizeHtml';
import { uuid } from './uuid';
import type { ChecklistItem } from '../types';

const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'LI', 'UL', 'OL', 'BLOCKQUOTE']);

/** Flattens rich-text HTML to plain lines, breaking on <br> and block-level element boundaries. */
export function htmlToLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  const lines: string[] = [];
  let buffer = '';

  const flush = () => {
    lines.push(buffer);
    buffer = '';
  };

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        buffer += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      if (el.tagName === 'BR') {
        flush();
      } else if (el.tagName === 'IMG') {
        // Inline images have no textual line -- drop them.
      } else if (BLOCK_TAGS.has(el.tagName)) {
        if (buffer.trim() !== '') flush();
        else buffer = '';
        walk(el);
        flush();
      } else {
        walk(el);
      }
    }
  };

  walk(doc.body);
  if (buffer !== '') flush();
  return lines.map((line) => line.trim());
}

/** Turns a rich-text body into checklist items -- one per non-empty line, all unchecked. */
export function htmlToChecklistItems(html: string): ChecklistItem[] {
  const items = htmlToLines(html)
    .filter((text) => text.length > 0)
    .map((text) => ({ id: uuid(), text, checked: false }));
  // An empty body still gets one blank row to type into, matching how a brand-new list opens.
  return items.length > 0 ? items : [{ id: uuid(), text: '', checked: false }];
}

/** Turns checklist items back into a rich-text body -- one <div> line each, checked items last. */
export function checklistItemsToHtml(items: ChecklistItem[]): string {
  const container = document.createElement('div');
  for (const item of orderChecklistItems(items)) {
    const line = document.createElement('div');
    if (item.text.trim() === '') line.appendChild(document.createElement('br'));
    else line.textContent = item.text;
    container.appendChild(line);
  }
  return container.innerHTML;
}
