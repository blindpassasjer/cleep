import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import type { NoteColor } from '../types';

export function NoteComposer({ onCreate }: { onCreate: (title: string, content: string, color: NoteColor) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState<NoteColor>('default');

  function close() {
    if (title.trim() || content.trim()) {
      onCreate(title.trim(), content.trim(), color);
    }
    setTitle('');
    setContent('');
    setColor('default');
    setExpanded(false);
  }

  if (!expanded) {
    return (
      <div className="composer collapsed" onClick={() => setExpanded(true)}>
        <span>Take a note…</span>
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
      <div className="composer-footer">
        <ColorPicker value={color} onChange={setColor} />
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
