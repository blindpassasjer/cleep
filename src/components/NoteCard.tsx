import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import type { Note, NoteColor, View } from '../types';

interface Props {
  note: Note;
  view: View;
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived'>>) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteCard({ note, view, onUpdate, onTrash, onRestore, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  function save() {
    if (title !== note.title || content !== note.content) {
      onUpdate(note.id, { title, content });
    }
    setEditing(false);
  }

  return (
    <div className={`note-card color-${note.color}`}>
      {editing ? (
        <>
          <input className="note-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className="note-content" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
        </>
      ) : (
        <div onClick={() => view === 'notes' || view === 'archive' ? setEditing(true) : undefined}>
          {note.title && <div className="note-title">{note.title}</div>}
          {note.content && <div className="note-content">{note.content}</div>}
        </div>
      )}

      <div className="note-footer">
        {editing ? (
          <>
            <ColorPicker value={note.color as NoteColor} onChange={(color) => onUpdate(note.id, { color })} />
            <button type="button" onClick={save}>
              Done
            </button>
          </>
        ) : view === 'trash' ? (
          <>
            <button type="button" onClick={() => onRestore(note.id)}>
              Restore
            </button>
            <button type="button" onClick={() => onDelete(note.id)}>
              Delete forever
            </button>
          </>
        ) : (
          <>
            <button type="button" title={note.pinned ? 'Unpin' : 'Pin'} onClick={() => onUpdate(note.id, { pinned: !note.pinned })}>
              {note.pinned ? '📌' : '📍'}
            </button>
            <button
              type="button"
              title={note.archived ? 'Unarchive' : 'Archive'}
              onClick={() => onUpdate(note.id, { archived: !note.archived })}
            >
              {note.archived ? '📤' : '🗄️'}
            </button>
            <button type="button" title="Delete" onClick={() => onTrash(note.id)}>
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  );
}
