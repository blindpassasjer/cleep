import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ColorPicker } from './ColorPicker';
import { ChecklistEditor } from './ChecklistEditor';
import { TextFormatToolbar } from './TextFormatToolbar';
import { IconArchive, IconClose, IconPin, IconPinFilled, IconTag, IconTrash } from './Icons';
import type { ChecklistItem, Label, NoteColor } from '../types';

const FLIP_OPEN_MS = 220;
const FLIP_CLOSE_MS = 180;

interface Props {
  originRect: DOMRect;
  title: string;
  content: string;
  isChecklist: boolean;
  items: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  labels: Label[];
  labelIds: string[];
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onItemsChange: (items: ChecklistItem[]) => void;
  onColorChange: (color: NoteColor) => void;
  onTogglePin: () => void;
  onToggleLabel: (labelId: string) => void;
  onArchive: () => void;
  onTrash: () => void;
  onClose: () => void;
  onCloseStart: () => void;
}

function flipTransform(from: DOMRect, to: DOMRect) {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
}

export function NoteModal({
  originRect,
  title,
  content,
  isChecklist,
  items,
  color,
  pinned,
  labels,
  labelIds,
  onTitleChange,
  onContentChange,
  onItemsChange,
  onColorChange,
  onTogglePin,
  onToggleLabel,
  onArchive,
  onTrash,
  onClose,
  onCloseStart,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [closing, setClosing] = useState<'flip' | 'fade' | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  useLayoutEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const finalRect = el.getBoundingClientRect();
    el.style.transition = 'none';
    el.style.transform = flipTransform(originRect, finalRect);
    el.style.opacity = '0.5';
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.transition = `transform ${FLIP_OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease`;
      el.style.transform = 'none';
      el.style.opacity = '1';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- FLIP animation runs once against the captured origin rect
  }, []);

  function requestClose(mode: 'flip' | 'fade' = 'flip') {
    setClosing(mode);
    // Reveal the grid card immediately (not after the animation finishes) so it's already sitting
    // in place — visible or mid-leave-animation — by the time the modal finishes flying back onto
    // it. Waiting until onClose() (post-animation) left a gap where neither was visible.
    onCloseStart();
    const el = modalRef.current;
    if (el && mode === 'flip') {
      const currentRect = el.getBoundingClientRect();
      el.style.transition = `transform ${FLIP_CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${FLIP_CLOSE_MS}ms ease`;
      el.style.transform = flipTransform(originRect, currentRect);
      el.style.opacity = '0';
    }
    setTimeout(onClose, FLIP_CLOSE_MS);
  }

  // The keydown listener is attached once (empty deps, so it survives re-renders without
  // re-attaching), but must still call the *current* render's requestClose/onClose — otherwise
  // Escape saves whatever title/content existed when the modal first opened, silently dropping
  // any edits made afterward. A ref sidesteps the stale closure.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') requestCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return createPortal(
    <div className={`note-modal-backdrop ${closing ? 'closing' : ''}`} onClick={() => requestClose()}>
      <div
        className={`note-modal color-${color} ${closing === 'fade' ? 'note-modal-fading' : ''}`}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="note-modal-header">
          <button type="button" title={pinned ? 'Unpin' : 'Pin'} onClick={onTogglePin}>
            {pinned ? <IconPinFilled /> : <IconPin />}
          </button>
          <button type="button" title="Close" className="note-modal-close" onClick={() => requestClose()}>
            <IconClose />
          </button>
        </div>
        <input
          className="note-title"
          placeholder="Title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          autoFocus
        />
        {isChecklist ? (
          <ChecklistEditor items={items} onChange={onItemsChange} autoFocusLast />
        ) : (
          <>
            <textarea
              ref={contentRef}
              className="note-content note-modal-content"
              placeholder="Take a note…"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
            />
            <TextFormatToolbar textareaRef={contentRef} value={content} onChange={onContentChange} />
          </>
        )}
        {showLabels && (
          <div className="note-labels-editor">
            {labels.length === 0 && <span className="note-labels-empty">No collections yet.</span>}
            {labels.map((label) => (
              <label key={label.id} className="note-label-toggle">
                <input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => onToggleLabel(label.id)} />
                {label.name}
              </label>
            ))}
          </div>
        )}
        <div className="note-modal-footer">
          <ColorPicker value={color} onChange={onColorChange} />
          <button type="button" title="Collections" onClick={() => setShowLabels((v) => !v)}>
            <IconTag />
          </button>
          <button
            type="button"
            title="Archive"
            onClick={() => {
              requestClose('fade');
              onArchive();
            }}
          >
            <IconArchive />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={() => {
              requestClose('fade');
              onTrash();
            }}
          >
            <IconTrash />
          </button>
          <button type="button" className="text-action" onClick={() => requestClose()}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
