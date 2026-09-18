import { useEffect, useRef } from 'react';
import { IconChevronDown, IconChevronUp, IconClose } from './Icons';

interface Props {
  query: string;
  matchCount: number;
  currentIndex: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/** Floating find bar for searching within one open note -- intercepts Cmd/Ctrl+F inside NoteModal
 *  instead of the browser's own page find (see NoteModal's keydown handler). */
export function NoteFind({ query, matchCount, currentIndex, onQueryChange, onNext, onPrev, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="note-find">
      <input
        ref={inputRef}
        className="note-find-input"
        value={query}
        placeholder="Find in note"
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="note-find-count">{query ? `${matchCount > 0 ? currentIndex + 1 : 0} / ${matchCount}` : ''}</span>
      <button type="button" title="Previous match" onClick={onPrev} disabled={matchCount === 0}>
        <IconChevronUp width={16} height={16} />
      </button>
      <button type="button" title="Next match" onClick={onNext} disabled={matchCount === 0}>
        <IconChevronDown width={16} height={16} />
      </button>
      <button type="button" title="Close find" onClick={onClose}>
        <IconClose width={14} height={14} />
      </button>
    </div>
  );
}
