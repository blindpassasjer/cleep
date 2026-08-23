import type { Attachment } from '../types';

/**
 * Drops a ![alt](url) reference for an attachment at the current cursor position in a note's
 * content textarea (or at the end if the textarea isn't focused/mounted yet), so an already
 * uploaded photo/GIF can be placed inline in the text rather than only living in the gallery.
 */
export function insertMarkdownImage(
  el: HTMLTextAreaElement | null,
  content: string,
  onChange: (value: string) => void,
  attachment: Attachment,
) {
  const cursor = el && document.activeElement === el ? el.selectionStart : content.length;
  const needsLeadingNewline = cursor > 0 && content[cursor - 1] !== '\n';
  const insertion = `${needsLeadingNewline ? '\n' : ''}![${attachment.name}](${attachment.url})\n`;
  const next = content.slice(0, cursor) + insertion + content.slice(cursor);
  onChange(next);
  if (el) {
    requestAnimationFrame(() => {
      el.focus();
      const pos = cursor + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  }
}
