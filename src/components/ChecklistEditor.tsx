import { useEffect, useMemo, useRef } from 'react';
import { IconClose } from './Icons';
import { useFlipReorder } from '../hooks/useFlipReorder';
import { orderChecklistItems } from '../lib/orderChecklistItems';
import { uuid } from '../lib/uuid';
import type { ChecklistItem } from '../types';

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  autoFocusLast?: boolean;
}

export function ChecklistEditor({ items, onChange, autoFocusLast }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAddedId = useRef<string | null>(null);

  // Stored order is left untouched; only the render order partitions checked items to the bottom.
  const orderedItems = useMemo(() => orderChecklistItems(items), [items]);
  useFlipReorder(containerRef, orderedItems.map((item) => item.id));

  useEffect(() => {
    if (autoFocusLast && lastAddedId.current) {
      containerRef.current
        ?.querySelector<HTMLInputElement>(`[data-flip-id="${CSS.escape(lastAddedId.current)}"] .checklist-text`)
        ?.focus();
      lastAddedId.current = null;
    }
  }, [items, autoFocusLast]);

  function updateItem(id: string, patch: Partial<ChecklistItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function addItem() {
    const id = uuid();
    lastAddedId.current = id;
    onChange([...items, { id, text: '', checked: false }]);
  }

  return (
    <div className="checklist-editor" ref={containerRef}>
      {orderedItems.map((item) => (
        <div key={item.id} data-flip-id={item.id} className={`checklist-row ${item.checked ? 'checked' : ''}`}>
          <input type="checkbox" checked={item.checked} onChange={(e) => updateItem(item.id, { checked: e.target.checked })} />
          <input
            type="text"
            className="checklist-text"
            value={item.text}
            placeholder="List item"
            onChange={(e) => updateItem(item.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              } else if (e.key === 'Backspace' && item.text === '') {
                e.preventDefault();
                removeItem(item.id);
              }
            }}
          />
          <button type="button" className="checklist-remove" title="Remove item" onClick={() => removeItem(item.id)}>
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}
      <button type="button" className="checklist-add" onClick={addItem}>
        + Add item
      </button>
    </div>
  );
}
