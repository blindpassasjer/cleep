import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { ChecklistEditor } from './ChecklistEditor';
import { RichTextEditor } from './RichTextEditor';
import { IconChecklist, IconClose, IconNotes } from './Icons';
import { uuid } from '../lib/uuid';
import type { NoteBlock } from '../types';

interface Props {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
  /** Kept pointed at whichever text block's contentEditable last had focus, so the caller's
   *  formatting toolbar/image-insert (which only make sense for one text block at a time) know
   *  which block to act on. */
  activeTextBlockRef: React.MutableRefObject<HTMLDivElement | null>;
  placeholder?: string;
  /** Autofocuses the first block's editor on mount, iff it's an empty text block -- used by the
   *  composer's "Take a note…" entry point, never by the modal opening an existing note. */
  autoFocusFirstText?: boolean;
}

/**
 * Renders a note's body as an ordered list of blocks -- each one either a rich-text section
 * (RichTextEditor) or a checklist section (ChecklistEditor), so a single note can mix paragraphs
 * and checkboxes instead of being forced into one shape for its whole lifetime.
 */
export const BlockEditor = forwardRef<HTMLDivElement, Props>(function BlockEditor(
  { blocks, onChange, activeTextBlockRef, placeholder, autoFocusFirstText },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, []);
  const blockElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  // Set once, at construction, to the block that should grab focus on this mount -- either the
  // composer's very first (empty) block, or whichever block "+ Text"/"+ Checklist" just added.
  const focusTargetId = useRef<string | null>(
    autoFocusFirstText && blocks[0]?.type === 'text' && blocks[0].html === '' ? blocks[0].id : null,
  );

  useEffect(() => {
    focusTargetId.current = null;
  }, [blocks.length]);

  useEffect(() => {
    if (activeTextBlockRef.current) return;
    const firstText = blocks.find((b) => b.type === 'text');
    if (firstText) activeTextBlockRef.current = blockElsRef.current[firstText.id] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only needs to seed the initial target once
  }, []);

  function updateBlock(id: string, next: NoteBlock) {
    onChange(blocks.map((b) => (b.id === id ? next : b)));
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  function addBlock(type: 'text' | 'checklist') {
    const id = uuid();
    if (type === 'text') focusTargetId.current = id;
    const block: NoteBlock = type === 'text' ? { id, type: 'text', html: '' } : { id, type: 'checklist', items: [] };
    onChange([...blocks, block]);
  }

  return (
    <div className="block-editor" ref={rootRef}>
      {blocks.map((block, i) => (
        <div key={block.id} className="note-block">
          {block.type === 'text' ? (
            <RichTextEditor
              ref={(el) => {
                blockElsRef.current[block.id] = el;
                if (el) el.dataset.blockId = block.id;
              }}
              className="note-content note-modal-content"
              placeholder={i === 0 ? placeholder : undefined}
              value={block.html}
              onChange={(html) => updateBlock(block.id, { ...block, html })}
              onFocus={() => {
                activeTextBlockRef.current = blockElsRef.current[block.id] ?? null;
              }}
              autoFocus={focusTargetId.current === block.id}
            />
          ) : (
            <ChecklistEditor
              items={block.items}
              onChange={(items) => updateBlock(block.id, { ...block, items })}
              autoFocusLast
            />
          )}
          {blocks.length > 1 && (
            <button type="button" className="block-remove" title="Remove section" onClick={() => removeBlock(block.id)}>
              <IconClose width={14} height={14} />
            </button>
          )}
        </div>
      ))}
      <div className="block-editor-add">
        <button type="button" onClick={() => addBlock('text')}>
          <IconNotes width={16} height={16} /> Text
        </button>
        <button type="button" onClick={() => addBlock('checklist')}>
          <IconChecklist width={16} height={16} /> Checklist
        </button>
      </div>
    </div>
  );
});
