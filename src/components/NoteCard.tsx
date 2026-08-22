import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { api } from '../api/client';
import type { Label, Note, NoteColor, View } from '../types';

interface Props {
  note: Note;
  view: View;
  labels: Label[];
  onUpdate: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived'>>) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteCard({ note, view, labels, onUpdate, onTrash, onRestore, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [labelIds, setLabelIds] = useState(note.labelIds);
  const [showLabels, setShowLabels] = useState(false);

  function save() {
    if (title !== note.title || content !== note.content) {
      onUpdate(note.id, { title, content });
    }
    setEditing(false);
    setShowLabels(false);
  }

  async function toggleLabel(labelId: string) {
    const attached = labelIds.includes(labelId);
    setLabelIds((prev) => (attached ? prev.filter((id) => id !== labelId) : [...prev, labelId]));
    try {
      if (attached) {
        await api.detachLabel(note.id, labelId);
      } else {
        await api.attachLabel(note.id, labelId);
      }
    } catch {
      setLabelIds(note.labelIds);
    }
  }

  const editable = view.kind === 'notes' || view.kind === 'archive' || view.kind === 'label';

  return (
    <div className={`note-card color-${note.color}`}>
      {editing ? (
        <>
          <input className="note-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <textarea className="note-content" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
        </>
      ) : (
        <div onClick={() => (editable ? setEditing(true) : undefined)}>
          {note.title && <div className="note-title">{note.title}</div>}
          {note.content && <div className="note-content">{note.content}</div>}
          {labelIds.length > 0 && (
            <div className="note-labels">
              {labelIds.map((id) => {
                const label = labels.find((l) => l.id === id);
                return label ? (
                  <span key={id} className="note-label-chip">
                    {label.name}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}

      {editing && showLabels && (
        <div className="note-labels-editor">
          {labels.length === 0 && <span className="note-labels-empty">No collections yet.</span>}
          {labels.map((label) => (
            <label key={label.id} className="note-label-toggle">
              <input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => toggleLabel(label.id)} />
              {label.name}
            </label>
          ))}
        </div>
      )}

      <div className="note-footer">
        {editing ? (
          <>
            <ColorPicker value={note.color as NoteColor} onChange={(color) => onUpdate(note.id, { color })} />
            <button type="button" title="Collections" onClick={() => setShowLabels((v) => !v)}>
              🏷️
            </button>
            <button type="button" onClick={save}>
              Done
            </button>
          </>
        ) : view.kind === 'trash' ? (
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
