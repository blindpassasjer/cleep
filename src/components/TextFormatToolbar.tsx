import { IconBold, IconBulletList, IconItalic } from './Icons';

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

export function TextFormatToolbar({ textareaRef, value, onChange }: Props) {
  function withTextarea(fn: (el: HTMLTextAreaElement) => void) {
    const el = textareaRef.current;
    if (el) fn(el);
  }

  return (
    <div className="format-toolbar">
      <button type="button" title="Bold" onClick={() => withTextarea((el) => wrapSelection(el, value, onChange, '**'))}>
        <IconBold width={16} height={16} />
      </button>
      <button type="button" title="Italic" onClick={() => withTextarea((el) => wrapSelection(el, value, onChange, '*'))}>
        <IconItalic width={16} height={16} />
      </button>
      <button type="button" title="Bullet list" onClick={() => withTextarea((el) => prefixCurrentLine(el, value, onChange, '- '))}>
        <IconBulletList width={16} height={16} />
      </button>
    </div>
  );
}
