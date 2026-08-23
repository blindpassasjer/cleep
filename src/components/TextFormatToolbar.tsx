import { IconBold, IconBulletList, IconGif, IconHeading, IconItalic, IconNumberedList } from './Icons';

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

function wrapSelection(el: HTMLTextAreaElement, value: string, onChange: (v: string) => void, marker: string) {
  const { selectionStart, selectionEnd } = el;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length);
  });
}

function prefixCurrentLine(el: HTMLTextAreaElement, value: string, onChange: (v: string) => void, prefix: string) {
  const { selectionStart } = el;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length);
  });
}

// Cycles the current line through no-heading -> # -> ## -> ### -> no-heading, mirroring how most
// editors treat a single "heading" toolbar button rather than needing three separate buttons.
function cycleHeading(el: HTMLTextAreaElement, value: string, onChange: (v: string) => void) {
  const { selectionStart } = el;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndIdx = value.indexOf('\n', lineStart);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const match = /^(#{1,3})\s+/.exec(line);

  let newLine: string;
  if (!match) newLine = `# ${line}`;
  else if (match[1].length < 3) newLine = `${'#'.repeat(match[1].length + 1)} ${line.slice(match[0].length)}`;
  else newLine = line.slice(match[0].length);

  const next = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
  onChange(next);
  const delta = newLine.length - line.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(selectionStart + delta, selectionStart + delta);
  });
}

// Inserts a ![alt](url) reference on its own line at the cursor -- used for pasting in an
// external GIF link (Giphy/Tenor and the like) without needing to upload a file first.
function insertImageUrl(el: HTMLTextAreaElement, value: string, onChange: (v: string) => void) {
  const url = window.prompt('GIF or image URL (e.g. a Giphy or Tenor link)');
  if (!url || !url.trim()) return;
  const alt = window.prompt('Description (optional, for accessibility)') ?? '';

  const { selectionStart } = el;
  const needsLeadingNewline = selectionStart > 0 && value[selectionStart - 1] !== '\n';
  const insertion = `${needsLeadingNewline ? '\n' : ''}![${alt.trim()}](${url.trim()})\n`;
  const next = value.slice(0, selectionStart) + insertion + value.slice(selectionStart);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = selectionStart + insertion.length;
    el.setSelectionRange(pos, pos);
  });
}

export function TextFormatToolbar({ textareaRef, value, onChange }: Props) {
  function withTextarea(fn: (el: HTMLTextAreaElement) => void) {
    const el = textareaRef.current;
    if (el) fn(el);
  }

  return (
    <div className="format-toolbar">
      <button type="button" title="Heading" onClick={() => withTextarea((el) => cycleHeading(el, value, onChange))}>
        <IconHeading width={16} height={16} />
      </button>
      <button type="button" title="Bold" onClick={() => withTextarea((el) => wrapSelection(el, value, onChange, '**'))}>
        <IconBold width={16} height={16} />
      </button>
      <button type="button" title="Italic" onClick={() => withTextarea((el) => wrapSelection(el, value, onChange, '*'))}>
        <IconItalic width={16} height={16} />
      </button>
      <button type="button" title="Bullet list" onClick={() => withTextarea((el) => prefixCurrentLine(el, value, onChange, '- '))}>
        <IconBulletList width={16} height={16} />
      </button>
      <button type="button" title="Numbered list" onClick={() => withTextarea((el) => prefixCurrentLine(el, value, onChange, '1. '))}>
        <IconNumberedList width={16} height={16} />
      </button>
      <button type="button" title="Insert GIF/image URL" onClick={() => withTextarea((el) => insertImageUrl(el, value, onChange))}>
        <IconGif width={16} height={16} />
      </button>
    </div>
  );
}
