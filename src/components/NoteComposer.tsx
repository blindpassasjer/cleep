import { useRef, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { ChecklistEditor } from './ChecklistEditor';
import { TextFormatToolbar } from './TextFormatToolbar';
import { IconChecklist, IconPlus } from './Icons';
import type { ChecklistItem, NoteColor } from '../types';

interface Props {
  onCreate: (title: string, content: string, color: NoteColor, extra?: { isChecklist?: boolean; items?: ChecklistItem[] }) => Promise<void>;
}

export function NoteComposer({ onCreate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isChecklist, setIsChecklist] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [color, setColor] = useState<NoteColor>('default');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setTitle('');
    setContent('');
    setItems([]);
    setColor('default');
    setIsChecklist(false);
    setExpanded(false);
  }

  function startChecklist() {
    setIsChecklist(true);
    setItems([{ id: crypto.randomUUID(), text: '', checked: false }]);
    setExpanded(true);
  }

  async function close() {
    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const isEmpty = isChecklist ? cleanedItems.length === 0 && !title.trim() : !title.trim() && !content.trim();
    if (isEmpty) {
      reset();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(title.trim(), content.trim(), color, isChecklist ? { isChecklist: true, items: cleanedItems } : undefined);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <div className="composer collapsed">
        <span onClick={() => setExpanded(true)}>Take a note…</span>
        <div className="composer-collapsed-actions">
          <button type="button" title="New list" onClick={startChecklist}>
            <IconChecklist width={18} height={18} />
          </button>
          <IconPlus className="composer-plus" onClick={() => setExpanded(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className={`composer expanded color-${color}`}>
      <input
        className="composer-title"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      {isChecklist ? (
        <ChecklistEditor items={items} onChange={setItems} autoFocusLast />
      ) : (
        <>
          <textarea
            ref={contentRef}
            className="composer-content"
            placeholder="Take a note…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
          <TextFormatToolbar textareaRef={contentRef} value={content} onChange={setContent} />
        </>
      )}
      {error && <div className="composer-error">{error}</div>}
      <div className="composer-footer">
        <ColorPicker value={color} onChange={setColor} />
        <button type="button" onClick={close} disabled={saving}>
          {saving ? 'Saving…' : 'Close'}
        </button>
      </div>
    </div>
  );
}
