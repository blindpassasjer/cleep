import { useMemo, useRef } from 'react';
import { useFlipReorder } from '../hooks/useFlipReorder';
import { orderChecklistItems } from '../lib/orderChecklistItems';
import type { ChecklistItem } from '../types';

const CHECKLIST_PREVIEW_LIMIT = 6;

interface Props {
  items: ChecklistItem[];
}

/** Read-only checklist preview for one checklist block on the notes grid -- ticking items happens
 *  in the open note, not the card. Split out from NoteCard so each checklist block in a note gets
 *  its own FLIP-reorder container (useFlipReorder can't be shared across multiple lists at once). */
export function ChecklistPreviewBlock({ items }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orderedItems = useMemo(() => orderChecklistItems(items), [items]);
  const previewItems = orderedItems.slice(0, CHECKLIST_PREVIEW_LIMIT);
  const hiddenItemCount = orderedItems.length - previewItems.length;
  useFlipReorder(containerRef, previewItems.map((item) => item.id));

  return (
    <div className="note-checklist-preview" ref={containerRef}>
      {previewItems.map((item) => (
        <div key={item.id} data-flip-id={item.id} className={`checklist-row preview ${item.checked ? 'checked' : ''}`}>
          <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} aria-hidden="true" />
          <span>{item.text}</span>
        </div>
      ))}
      {hiddenItemCount > 0 && <div className="checklist-more">+{hiddenItemCount} more</div>}
    </div>
  );
}
