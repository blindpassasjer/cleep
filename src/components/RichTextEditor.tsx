import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * A minimal rich-text editor: a contentEditable div, deliberately left uncontrolled after its
 * initial mount (re-writing innerHTML from `value` on every keystroke would reset the caret), so
 * it only seeds content once and reports changes upward via onChange instead of round-tripping
 * through React state. Formatting itself is applied by the toolbar via document.execCommand on
 * this element's ref, not by anything in here.
 */
export const RichTextEditor = forwardRef<HTMLDivElement, Props>(function RichTextEditor(
  { value, onChange, placeholder, className, autoFocus },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => elRef.current as HTMLDivElement, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.innerHTML = sanitizeHtml(value);
    if (autoFocus) el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds content once from the initial value only; see the component doc above
  }, []);

  function handleInput() {
    if (elRef.current) onChange(elRef.current.innerHTML);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeHtml(html));
    } else {
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    }
    handleInput();
  }

  return (
    <div
      ref={elRef}
      className={className}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={handleInput}
      onPaste={handlePaste}
    />
  );
});
