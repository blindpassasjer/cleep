import { useEffect, useMemo, useRef, useState } from 'react';
import { IconClose } from './Icons';
import { useFlipReorder } from '../hooks/useFlipReorder';
import { completedItemMatches } from '../lib/completedItemMatches';
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

  // Which row is focused, and how far the user has arrow-keyed into its "bring back" suggestions.
  // `dismissed` is set by Escape so the list stays hidden until the text changes again.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Stored order is left untouched; only the render order partitions checked items to the bottom.
  const orderedItems = useMemo(() => orderChecklistItems(items), [items]);
  useFlipReorder(containerRef, orderedItems.map((item) => item.id));

  const activeItem = items.find((item) => item.id === activeId) ?? null;
  const suggestions =
    activeItem && !activeItem.checked && !dismissed
      ? completedItemMatches(items, activeItem.text)
      : [];

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

  function focusItem(id: string) {
    const input = containerRef.current?.querySelector<HTMLInputElement>(
      `[data-flip-id="${CSS.escape(id)}"] .checklist-text`,
    );
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  /** Un-checks the previously completed `matchId` and drops the row the user was typing into, so the
   *  revived item slides back to its old slot among the unchecked items instead of being duplicated. */
  function reviveItem(matchId: string, typingId: string) {
    onChange(
      items
        .filter((item) => item.id !== typingId)
        .map((item) => (item.id === matchId ? { ...item, checked: false } : item)),
    );
    setDismissed(true);
    requestAnimationFrame(() => focusItem(matchId));
  }

  /** Removes `id` and moves the caret to the end of the previous row's text -- so holding Backspace
   *  walks back up the list the way it would in a single multi-line field. */
  function removeItemFocusingPrev(id: string) {
    const idx = orderedItems.findIndex((item) => item.id === id);
    const prev = idx > 0 ? orderedItems[idx - 1] : null;
    removeItem(id);
    if (prev) focusItem(prev.id);
  }

  function addItem() {
    const id = uuid();
    lastAddedId.current = id;
    onChange([...items, { id, text: '', checked: false }]);
  }

  return (
    <div className="checklist-editor" ref={containerRef}>
      {orderedItems.map((item) => {
        const showSuggestions = item.id === activeId && suggestions.length > 0;
        return (
        <div key={item.id} data-flip-id={item.id} className={`checklist-row ${item.checked ? 'checked' : ''}`}>
          <input
            type="checkbox"
            checked={item.checked}
            aria-label={item.text.trim() || 'List item'}
            onChange={(e) => updateItem(item.id, { checked: e.target.checked })}
          />
          <input
            type="text"
            className="checklist-text"
            value={item.text}
            placeholder="List item"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            onFocus={() => {
              setActiveId(item.id);
              setHighlight(0);
              setDismissed(false);
            }}
            onBlur={() => setActiveId((cur) => (cur === item.id ? null : cur))}
            onChange={(e) => {
              updateItem(item.id, { text: e.target.value });
              setHighlight(0);
              setDismissed(false);
            }}
            onKeyDown={(e) => {
              if (showSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                setHighlight((h) => {
                  const n = suggestions.length;
                  return e.key === 'ArrowDown' ? (h + 1) % n : (h - 1 + n) % n;
                });
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (showSuggestions && suggestions[highlight]) {
                  reviveItem(suggestions[highlight].id, item.id);
                } else {
                  addItem();
                }
              } else if (e.key === 'Escape' && showSuggestions) {
                e.preventDefault();
                setDismissed(true);
              } else if (e.key === 'Backspace' && item.text === '') {
                e.preventDefault();
                removeItemFocusingPrev(item.id);
              }
            }}
          />
          <button type="button" className="checklist-remove" title="Remove item" onClick={() => removeItem(item.id)}>
            <IconClose width={14} height={14} />
          </button>
          {showSuggestions && (
            <ul className="checklist-suggestions" role="listbox">
              {suggestions.map((match, i) => (
                <li key={match.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={`checklist-suggestion ${i === highlight ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => reviveItem(match.id, item.id)}
                  >
                    <span className="checklist-suggestion-label">Bring back</span>
                    <span className="checklist-suggestion-text">{match.text.trim() || 'List item'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        );
      })}
      <button type="button" className="checklist-add" onClick={addItem}>
        + Add item
      </button>
    </div>
  );
}
