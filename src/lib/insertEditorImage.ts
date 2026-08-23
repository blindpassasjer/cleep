import type { Attachment } from '../types';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Places the cursor at the end of the editor's content -- used when it isn't currently focused
// (e.g. the user clicked an attachment thumbnail's "insert" button, which lives outside the
// contentEditable), so the image lands somewhere predictable instead of wherever the browser
// happens to leave the caret on refocus.
function focusAtEnd(el: HTMLDivElement) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Drops an <img> for an already-uploaded attachment at the current cursor position (or the end,
 * if the editor wasn't focused) -- lets an uploaded photo/GIF be placed inline in the note instead
 * of only living in the attachments gallery below it.
 */
export function insertEditorImage(el: HTMLDivElement | null, attachment: Attachment, onChange: (html: string) => void) {
  if (!el) return;
  if (document.activeElement !== el) focusAtEnd(el);
  else el.focus();
  document.execCommand('insertHTML', false, `<img src="${escapeAttr(attachment.url)}" alt="${escapeAttr(attachment.name)}">`);
  onChange(el.innerHTML);
}
