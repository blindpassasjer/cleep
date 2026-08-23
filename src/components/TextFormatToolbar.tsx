import { IconBold, IconBulletList, IconGif, IconHeading, IconItalic, IconNumberedList } from './Icons';

interface Props {
  editorRef: React.RefObject<HTMLDivElement>;
  onChange: (html: string) => void;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function withEditor(editorRef: React.RefObject<HTMLDivElement>, onChange: (html: string) => void, fn: (el: HTMLDivElement) => void) {
  const el = editorRef.current;
  if (!el) return;
  el.focus();
  fn(el);
  onChange(el.innerHTML);
}

// Cycles the current block through paragraph -> H1 -> H2 -> H3 -> paragraph, mirroring how most
// editors treat a single "heading" toolbar button rather than needing three separate buttons.
function cycleHeading() {
  const order = ['P', 'H1', 'H2', 'H3'];
  const current = (document.queryCommandValue('formatBlock') || 'P').toUpperCase().replace(/[<>]/g, '');
  const next = order[(order.indexOf(current) + 1) % order.length];
  document.execCommand('formatBlock', false, `<${next.toLowerCase()}>`);
}

// Inserts an <img> on its own line at the cursor -- used for pasting in an external GIF link
// (Giphy/Tenor and the like) without needing to upload a file first.
function insertImageUrl() {
  const url = window.prompt('GIF or image URL (e.g. a Giphy or Tenor link)');
  if (!url || !url.trim()) return;
  const alt = window.prompt('Description (optional, for accessibility)') ?? '';
  document.execCommand('insertHTML', false, `<img src="${escapeAttr(url.trim())}" alt="${escapeAttr(alt.trim())}">`);
}

export function TextFormatToolbar({ editorRef, onChange }: Props) {
  // Clicking a toolbar button would normally blur the editor and collapse its selection before
  // the click handler runs -- preventing that default on mousedown keeps the selection intact so
  // the subsequent execCommand call actually applies to what the user selected.
  const preserveSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="format-toolbar">
      <button type="button" title="Heading" onMouseDown={preserveSelection} onClick={() => withEditor(editorRef, onChange, cycleHeading)}>
        <IconHeading width={16} height={16} />
      </button>
      <button
        type="button"
        title="Bold"
        onMouseDown={preserveSelection}
        onClick={() => withEditor(editorRef, onChange, () => document.execCommand('bold'))}
      >
        <IconBold width={16} height={16} />
      </button>
      <button
        type="button"
        title="Italic"
        onMouseDown={preserveSelection}
        onClick={() => withEditor(editorRef, onChange, () => document.execCommand('italic'))}
      >
        <IconItalic width={16} height={16} />
      </button>
      <button
        type="button"
        title="Bullet list"
        onMouseDown={preserveSelection}
        onClick={() => withEditor(editorRef, onChange, () => document.execCommand('insertUnorderedList'))}
      >
        <IconBulletList width={16} height={16} />
      </button>
      <button
        type="button"
        title="Numbered list"
        onMouseDown={preserveSelection}
        onClick={() => withEditor(editorRef, onChange, () => document.execCommand('insertOrderedList'))}
      >
        <IconNumberedList width={16} height={16} />
      </button>
      <button type="button" title="Insert GIF/image URL" onMouseDown={preserveSelection} onClick={() => withEditor(editorRef, onChange, insertImageUrl)}>
        <IconGif width={16} height={16} />
      </button>
    </div>
  );
}
