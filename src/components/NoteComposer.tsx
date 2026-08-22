import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { IconPlus } from './Icons';
import type { NoteColor } from '../types';

export function NoteComposer({ onCreate }: { onCreate: (title: string, content: string, color: NoteColor) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState<NoteColor>('default');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function close() {
    if (!title.trim() && !content.trim()) {
      setExpanded(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(title.trim(), content.trim(), color);
      setTitle('');
      setContent('');
      setColor('default');
      setExpanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <div className="composer collapsed" onClick={() => setExpanded(true)}>
        <span>Take a note…</span>
        <IconPlus className="composer-plus" />
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
      <textarea
        className="composer-content"
        placeholder="Take a note…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
      />
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
