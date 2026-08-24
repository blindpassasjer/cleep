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
  onAttachmentsChange: (id: string, attachments: Note['attachments']) => void;
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
  onAttachmentsChange,
  onTrash,
  onRestore,
  onDelete,
  reorderable,
  onReorder,
}: Props) {
  const dragId = useRef<string | null>(null);

  // The server always sorts pinned notes before unpinned ones (see notes.ts's orderBy), but a
  // single continuous masonry pack doesn't respect that visually -- it fills whichever column is
  // currently shortest, so a pinned note can end up sharing a row with unpinned ones instead of
  // reading as a clearly separate leading block. Splitting into two independently-packed grids
  // (like Keep's own "Pinned"/"Others" sections) is what actually makes pinned notes look pinned.
  const pinnedNotes = notes.filter((n) => n.pinned);
  const otherNotes = notes.filter((n) => !n.pinned);
  const showSections = pinnedNotes.length > 0 && otherNotes.length > 0;

  // Hooks can't be called conditionally, so both grids are always laid out -- an empty list just
  // means its container ends up 0px tall, which costs nothing.
  const pinnedGrid = useMasonryLayout(pinnedNotes);
  const otherGrid = useMasonryLayout(otherNotes);

  // The server always sorts pinned notes before unpinned ones regardless of `position` (see
  // notes.ts's orderBy), so a drop that crosses the pin boundary would look like it worked but
  // silently snap back on the next fetch -- reject it (and show a "no drop" cursor while dragging
  // over it) instead of letting the UI promise an order change that doesn't actually stick.
  // Matters even with the two grids visually separated below, since they're still sibling
  // containers in the same document -- nothing stops a drag physically crossing between them.
  function sameGroup(targetId: string): boolean {
    const draggedId = dragId.current;
    if (!draggedId || draggedId === targetId) return false;
    const dragged = notes.find((n) => n.id === draggedId);
    const target = notes.find((n) => n.id === targetId);
    return !!dragged && !!target && dragged.pinned === target.pinned;
  }

  function handleDrop(targetId: string) {
    const draggedId = dragId.current;
    const canDrop = sameGroup(targetId);
    dragId.current = null;
    if (!draggedId || !canDrop) return;
    const ids = notes.map((n) => n.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
  }

  function renderSection(
    sectionNotes: Note[],
    containerRef: React.RefObject<HTMLDivElement>,
    setCardRef: (id: string, el: HTMLDivElement | null) => void,
    key: string,
  ) {
    return (
      <div className="notes-grid" ref={containerRef} key={key}>
        {sectionNotes.map((note) => (
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
              onAttachmentsChange={onAttachmentsChange}
              onTrash={onTrash}
              onRestore={onRestore}
              onDelete={onDelete}
              draggable={reorderable}
              onDragStart={() => {
                dragId.current = note.id;
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = sameGroup(note.id) ? 'move' : 'none';
              }}
              onDrop={() => handleDrop(note.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  // Always mount both grids (an empty one just costs a 0px-tall container) and key every child
  // explicitly, instead of switching the returned root between "one div" and "a 4-child fragment"
  // depending on showSections. That structural type change used to tear down and rebuild the
  // whole subtree on every transition across the pin boundary (e.g. switching views), which raced
  // with the view-transition-name App.tsx tags a `.notes-grid` with -- by the time the browser
  // captured the "new" snapshot, the DOM had already been torn down and rebuilt again, corrupting
  // the transition's layout math and leaving a stale offset that only a hard refresh cleared. A
  // single stable wrapper also gives App.tsx's querySelector('.notes-grid-root') exactly one
  // unambiguous, always-present target instead of picking arbitrarily between two `.notes-grid`s.
  return (
    <div className="notes-grid-root">
      {showSections && <div className="notes-section-label" key="pinned-label">Pinned</div>}
      {renderSection(pinnedNotes, pinnedGrid.containerRef, pinnedGrid.setCardRef, 'pinned-grid')}
      {showSections && <div className="notes-section-label" key="other-label">Others</div>}
      {renderSection(otherNotes, otherGrid.containerRef, otherGrid.setCardRef, 'other-grid')}
    </div>
  );
}
