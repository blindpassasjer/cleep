import { useEffect, useRef } from 'react';
import { IconClose } from './Icons';
import type { ChecklistItem } from '../types';

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  autoFocusLast?: boolean;
}

export function ChecklistEditor({ items, onChange, autoFocusLast }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLength = useRef(items.length);

  useEffect(() => {
    if (autoFocusLast && items.length > prevLength.current) {
      const inputs = containerRef.current?.querySelectorAll<HTMLInputElement>('.checklist-text');
      inputs?.[inputs.length - 1]?.focus();
    }
    prevLength.current = items.length;
  }, [items.length, autoFocusLast]);

  function updateItem(id: string, patch: Partial<ChecklistItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function addItem() {
    onChange([...items, { id: crypto.randomUUID(), text: '', checked: false }]);
  }

  return (
    <div className="checklist-editor" ref={containerRef}>
      {items.map((item) => (
        <div key={item.id} className={`checklist-row ${item.checked ? 'checked' : ''}`}>
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
