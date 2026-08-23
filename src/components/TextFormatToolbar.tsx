import { useEffect, useState } from 'react';
import { IconBold, IconBulletList, IconGif, IconHeading, IconItalic, IconNumberedList } from './Icons';

interface Props {
  editorRef: React.RefObject<HTMLDivElement>;
  onChange: (html: string) => void;
}

interface FormatState {
  bold: boolean;
  italic: boolean;
  bulletList: boolean;
  orderedList: boolean;
  heading: 'H1' | 'H2' | 'H3' | null;
}

const NO_FORMAT: FormatState = { bold: false, italic: false, bulletList: false, orderedList: false, heading: null };

function readFormatState(el: HTMLDivElement): FormatState {
  // queryCommandState reflects whatever's currently selected/focused *anywhere* in the document,
  // not specifically in this editor -- gate on it actually being the focused element so switching
  // focus elsewhere (another note, the title field, ...) doesn't leave stale buttons lit up.
  if (document.activeElement !== el) return NO_FORMAT;
  const block = (document.queryCommandValue('formatBlock') || 'P').toUpperCase().replace(/[<>]/g, '');
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    bulletList: document.queryCommandState('insertUnorderedList'),
    orderedList: document.queryCommandState('insertOrderedList'),
    heading: block === 'H1' || block === 'H2' || block === 'H3' ? block : null,
  };
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
  const [format, setFormat] = useState<FormatState>(NO_FORMAT);

  // Keeps the toolbar's pressed/active look in sync with wherever the caret actually is -- moving
  // it into bold text should light up the Bold button without any click, same as it disappears
  // when the caret leaves. selectionchange covers clicks/arrow keys/typing; it fires on the
  // document regardless of which element the selection is in.
  useEffect(() => {
    function update() {
      const el = editorRef.current;
      if (el) setFormat(readFormatState(el));
    }
    update();
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [editorRef]);

  function run(fn: (el: HTMLDivElement) => void) {
    withEditor(editorRef, onChange, fn);
    const el = editorRef.current;
    if (el) setFormat(readFormatState(el));
  }

  // Clicking a toolbar button would normally blur the editor and collapse its selection before
  // the click handler runs -- preventing that default on mousedown keeps the selection intact so
  // the subsequent execCommand call actually applies to what the user selected.
  const preserveSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="format-toolbar">
      <button
        type="button"
        title="Heading"
        className={format.heading ? 'active' : ''}
        onMouseDown={preserveSelection}
        onClick={() => run(cycleHeading)}
      >
        <IconHeading width={16} height={16} />
      </button>
      <button
        type="button"
        title="Bold"
        className={format.bold ? 'active' : ''}
        onMouseDown={preserveSelection}
        onClick={() => run(() => document.execCommand('bold'))}
      >
        <IconBold width={16} height={16} />
      </button>
      <button
        type="button"
        title="Italic"
        className={format.italic ? 'active' : ''}
        onMouseDown={preserveSelection}
        onClick={() => run(() => document.execCommand('italic'))}
      >
        <IconItalic width={16} height={16} />
      </button>
      <button
        type="button"
        title="Bullet list"
        className={format.bulletList ? 'active' : ''}
        onMouseDown={preserveSelection}
        onClick={() => run(() => document.execCommand('insertUnorderedList'))}
      >
        <IconBulletList width={16} height={16} />
      </button>
      <button
        type="button"
        title="Numbered list"
        className={format.orderedList ? 'active' : ''}
        onMouseDown={preserveSelection}
        onClick={() => run(() => document.execCommand('insertOrderedList'))}
      >
        <IconNumberedList width={16} height={16} />
      </button>
      <button type="button" title="Insert GIF/image URL" onMouseDown={preserveSelection} onClick={() => run(insertImageUrl)}>
        <IconGif width={16} height={16} />
      </button>
    </div>
  );
}
