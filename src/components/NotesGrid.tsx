import { useRef } from 'react';
import { NoteCard } from './NoteCard';
import { useMasonryLayout } from '../hooks/useMasonryLayout';
import type { Label, Note, View } from '../types';

type NoteUpdatePatch = Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived' | 'isChecklist' | 'items'>>;

interface Props {
  notes: Note[];
  view: View;
  labels: Label[];
  justCreatedId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onUpdate: (id: string, patch: NoteUpdatePatch) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  reorderable: boolean;
  onReorder: (orderedIds: string[]) => void;
}

export function NotesGrid({
  notes,
  view,
  labels,
  justCreatedId,
  selectedIds,
  onToggleSelect,
  onUpdate,
  onTrash,
  onRestore,
  onDelete,
  reorderable,
  onReorder,
}: Props) {
  const dragId = useRef<string | null>(null);
  const { containerRef, setCardRef } = useMasonryLayout(notes);

  function handleDrop(targetId: string) {
    const draggedId = dragId.current;
    dragId.current = null;
    if (!draggedId || draggedId === targetId) return;
    const ids = notes.map((n) => n.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
  }

  return (
    <div className="notes-grid" ref={containerRef}>
      {notes.map((note) => (
        <div key={note.id} className="notes-grid-item" ref={(el) => setCardRef(note.id, el)}>
          <NoteCard
            note={note}
            view={view}
            labels={labels}
            animateIn={note.id === justCreatedId}
            selected={selectedIds.has(note.id)}
            selectionActive={selectedIds.size > 0}
            onToggleSelect={onToggleSelect}
            onUpdate={onUpdate}
            onTrash={onTrash}
            onRestore={onRestore}
            onDelete={onDelete}
            draggable={reorderable}
            onDragStart={() => {
              dragId.current = note.id;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(note.id)}
          />
        </div>
      ))}
    </div>
  );
}
