import { useEffect, useRef, useState } from 'react';
import { IconBold, IconBulletList, IconGif, IconHeading, IconItalic, IconNumberedList } from './Icons';
import { sanitizeHtml } from '../lib/sanitizeHtml';

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

export function TextFormatToolbar({ editorRef, onChange }: Props) {
  const [format, setFormat] = useState<FormatState>(NO_FORMAT);
  const [showImageForm, setShowImageForm] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const imagePopoverRef = useRef<HTMLFormElement>(null);

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

  useEffect(() => {
    if (!showImageForm) return;
    function onPointerDown(e: MouseEvent) {
      if (imagePopoverRef.current && !imagePopoverRef.current.contains(e.target as Node)) setShowImageForm(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowImageForm(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showImageForm]);

  function run(fn: (el: HTMLDivElement) => void) {
    withEditor(editorRef, onChange, fn);
    const el = editorRef.current;
    if (el) setFormat(readFormatState(el));
  }

  function submitImage(e: React.FormEvent) {
    e.preventDefault();
    const url = imageUrl.trim();
    if (!url) return;
    const alt = imageAlt.trim();
    // Goes through the same allowlist sanitizer as pasted HTML (RichTextEditor's handlePaste) --
    // this URL is free-typed by the user, so it needs the same http(s)/same-origin src check
    // rather than trusting it just because it's wrapped in an <img> tag.
    run(() => document.execCommand('insertHTML', false, sanitizeHtml(`<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}">`)));
    setShowImageForm(false);
    setImageUrl('');
    setImageAlt('');
  }

  // Clicking a toolbar button would normally blur the editor and collapse its selection before
  // the click handler runs -- preventing that default on mousedown keeps the selection intact so
  // the subsequent execCommand call actually applies to what the user selected. Needed here too,
  // even though the click itself only opens a form -- it's what preserves the cursor position the
  // image should land at once the form is actually submitted (typing into the form's own inputs
  // necessarily steals focus from the editor in between).
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
      <div className="format-toolbar-image">
        <button
          type="button"
          title="Insert GIF/image URL"
          className={showImageForm ? 'active' : ''}
          onMouseDown={preserveSelection}
          onClick={() => setShowImageForm((v) => !v)}
        >
          <IconGif width={16} height={16} />
        </button>
        {showImageForm && (
          <form className="format-image-popover" ref={imagePopoverRef} onSubmit={submitImage}>
            <input
              autoFocus
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="GIF or image URL"
            />
            <input value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="Description (optional)" />
            <button type="submit" className="format-image-popover-submit" disabled={!imageUrl.trim()}>
              Insert
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
