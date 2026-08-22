import { useRef, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { NoteModal } from './NoteModal';
import { api } from '../api/client';
import { IconArchive, IconPalette, IconPin, IconPinFilled, IconTag, IconTrash } from './Icons';
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

const EXIT_ANIMATION_MS = 160;

export function NoteCard({ note, view, labels, onUpdate, onTrash, onRestore, onDelete }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [labelIds, setLabelIds] = useState(note.labelIds);
  const [showLabels, setShowLabels] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const editable = view.kind === 'notes' || view.kind === 'archive' || view.kind === 'label';

  function leaveThen(action: () => void) {
    setLeaving(true);
    setTimeout(action, EXIT_ANIMATION_MS);
  }

  function openEditor() {
    if (!editable) return;
    setOriginRect(cardRef.current?.getBoundingClientRect() ?? null);
    setEditing(true);
  }

  function closeEditor() {
    if (title !== note.title || content !== note.content) {
      onUpdate(note.id, { title, content });
    }
    setEditing(false);
    setOriginRect(null);
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

  return (
    <>
      <div
        ref={cardRef}
        className={`note-card color-${note.color} ${leaving ? 'note-leaving' : ''} ${editing ? 'note-editing-source' : ''}`}
      >
        <div onClick={openEditor}>
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

        {showColors && editable && (
          <div className="note-inline-picker" onClick={(e) => e.stopPropagation()}>
            <ColorPicker
              value={note.color as NoteColor}
              onChange={(color) => {
                onUpdate(note.id, { color });
                setShowColors(false);
              }}
            />
          </div>
        )}

        {showLabels && editable && (
          <div className="note-labels-editor" onClick={(e) => e.stopPropagation()}>
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
          {view.kind === 'trash' ? (
            <>
              <button type="button" className="text-action" onClick={() => leaveThen(() => onRestore(note.id))}>
                Restore
              </button>
              <button type="button" className="text-action" onClick={() => leaveThen(() => onDelete(note.id))}>
                Delete forever
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                title={note.pinned ? 'Unpin' : 'Pin'}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(note.id, { pinned: !note.pinned });
                }}
              >
                {note.pinned ? <IconPinFilled /> : <IconPin />}
              </button>
              <button
                type="button"
                title="Color"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColors((v) => !v);
                  setShowLabels(false);
                }}
              >
                <IconPalette />
              </button>
              <button
                type="button"
                title="Collections"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLabels((v) => !v);
                  setShowColors(false);
                }}
              >
                <IconTag />
              </button>
              <button
                type="button"
                title={note.archived ? 'Unarchive' : 'Archive'}
                onClick={(e) => {
                  e.stopPropagation();
                  leaveThen(() => onUpdate(note.id, { archived: !note.archived }));
                }}
              >
                <IconArchive />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  leaveThen(() => onTrash(note.id));
                }}
              >
                <IconTrash />
              </button>
            </>
          )}
        </div>
      </div>

      {editing && originRect && (
        <NoteModal
          originRect={originRect}
          title={title}
          content={content}
          color={note.color as NoteColor}
          pinned={note.pinned}
          labels={labels}
          labelIds={labelIds}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onColorChange={(color) => onUpdate(note.id, { color })}
          onTogglePin={() => onUpdate(note.id, { pinned: !note.pinned })}
          onToggleLabel={toggleLabel}
          onArchive={() => leaveThen(() => onUpdate(note.id, { archived: !note.archived }))}
          onTrash={() => leaveThen(() => onTrash(note.id))}
          onClose={closeEditor}
        />
      )}
    </>
  );
}
