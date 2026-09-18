import { useEffect, useMemo, useRef, useState } from 'react';
import { FlipModal } from './FlipModal';
import { ColorPicker } from './ColorPicker';
import { BlockEditor, type AddBlockFn } from './BlockEditor';
import { NoteFind } from './NoteFind';
import { TextFormatToolbar } from './TextFormatToolbar';
import { AttachmentsPanel } from './AttachmentsPanel';
import { LinkPreviewCard } from './LinkPreviewCard';
import { useLinkPreviews } from '../hooks/useLinkPreviews';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { extractLinks } from '../lib/extractLinks';
import { findMatches } from '../lib/findInBlocks';
import { clearMatchHighlight, scrollToBlockMatch } from '../lib/scrollToBlockMatch';
import { IconArchive, IconClose, IconLock, IconLockOpen, IconPalette, IconPin, IconPinFilled, IconSearch, IconTag, IconTrash } from './Icons';
import { useDateFormat } from '../hooks/useDateFormat';
import { formatNoteDate } from '../lib/formatDate';
import { insertEditorImage } from '../lib/insertEditorImage';
import type { Attachment, Label, NoteBlock, NoteColor } from '../types';

interface Props {
  originRect: DOMRect;
  getOriginRect?: () => DOMRect | null;
  title: string;
  blocks: NoteBlock[];
  color: NoteColor;
  pinned: boolean;
  locked: boolean;
  updatedAt: string;
  labels: Label[];
  labelIds: string[];
  attachments: Attachment[];
  onTitleChange: (value: string) => void;
  onBlocksChange: (blocks: NoteBlock[]) => void;
  onColorChange: (color: NoteColor) => void;
  onTogglePin: () => void;
  onToggleLabel: (labelId: string) => void;
  onUploadAttachment: (file: File | Blob, filename?: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => void;
  onRequestLock: () => void;
  onRequestRemoveLock: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onClose: () => void;
  onCloseStart: () => void;
}

export function NoteModal({
  originRect,
  getOriginRect,
  title,
  blocks,
  color,
  pinned,
  locked,
  updatedAt,
  labels,
  labelIds,
  attachments,
  onTitleChange,
  onBlocksChange,
  onColorChange,
  onTogglePin,
  onToggleLabel,
  onUploadAttachment,
  onDeleteAttachment,
  onRequestLock,
  onRequestRemoveLock,
  onArchive,
  onTrash,
  onClose,
  onCloseStart,
}: Props) {
  const activeTextBlockRef = useRef<HTMLDivElement | null>(null);
  const findScopeRef = useRef<HTMLDivElement | null>(null);
  const addBlockRef = useRef<AddBlockFn | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const { mode: dateMode } = useDateFormat();
  // Debounced so typing a URL character-by-character doesn't fire an unfurl request (and a
  // server-side DNS lookup + fetch) for every incomplete prefix along the way.
  const debouncedTitle = useDebouncedValue(title, 700);
  const textHtml = useMemo(() => blocks.filter((b) => b.type === 'text').map((b) => b.html).join('\n'), [blocks]);
  const debouncedContent = useDebouncedValue(textHtml, 700);
  const links = useMemo(
    () => extractLinks({ title: debouncedTitle, content: debouncedContent }),
    [debouncedTitle, debouncedContent],
  );
  const linkPreviews = useLinkPreviews(links);

  function updateActiveBlockHtml(html: string) {
    const id = activeTextBlockRef.current?.dataset.blockId;
    if (!id) return;
    onBlocksChange(blocks.map((b) => (b.id === id ? { ...b, html } : b)));
  }

  const findMatchList = useMemo(() => findMatches(blocks, findQuery), [blocks, findQuery]);

  function closeFind() {
    setFindOpen(false);
    setFindQuery('');
    setFindIndex(0);
    if (findScopeRef.current) clearMatchHighlight(findScopeRef.current);
  }

  function stepMatch(delta: 1 | -1) {
    setFindIndex((i) => {
      if (findMatchList.length === 0) return 0;
      return (i + delta + findMatchList.length) % findMatchList.length;
    });
  }

  // Intercepts Cmd/Ctrl+F while this note is open so it opens the in-note find bar instead of the
  // browser's own page find -- scoped to this component's lifetime (i.e. only while the note modal
  // is actually mounted), not the global hotkey system.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.getSelection()?.removeAllRanges();
    };
  }, []);

  // Jumps back to the first match on every new query. Separately, if the note's own content edits
  // shift the current index out of range (a match disappeared) without the query itself changing,
  // clamp back to the first match rather than pointing past the end of the list.
  useEffect(() => {
    setFindIndex(0);
  }, [findQuery]);
  useEffect(() => {
    setFindIndex((i) => (i < findMatchList.length ? i : 0));
  }, [findMatchList.length]);

  useEffect(() => {
    if (!findOpen || !findScopeRef.current) return;
    const match = findMatchList[findIndex];
    if (match) scrollToBlockMatch(findScopeRef.current, match);
    else clearMatchHighlight(findScopeRef.current);
  }, [findOpen, findIndex, findMatchList]);

  return (
    <FlipModal
      originRect={originRect}
      getOriginRect={getOriginRect}
      panelClassName={`color-${color}`}
      onClose={onClose}
      onCloseStart={onCloseStart}
    >
      {(close) => (
        <>
          <div className="note-modal-header">
            <div className="note-modal-header-actions">
              <button type="button" title={pinned ? 'Unpin' : 'Pin'} onClick={onTogglePin}>
                {pinned ? <IconPinFilled /> : <IconPin />}
              </button>
              <button type="button" title="Find in note" onClick={() => setFindOpen((v) => !v)}>
                <IconSearch />
              </button>
            </div>
            <button type="button" title="Close" className="note-modal-close" onClick={() => close()}>
              <IconClose />
            </button>
          </div>
          {findOpen && (
            <NoteFind
              query={findQuery}
              matchCount={findMatchList.length}
              currentIndex={findIndex}
              onQueryChange={setFindQuery}
              onNext={() => stepMatch(1)}
              onPrev={() => stepMatch(-1)}
              onClose={closeFind}
            />
          )}
          <input
            className="note-title"
            placeholder="Title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            autoFocus
          />
          <BlockEditor
            ref={findScopeRef}
            blocks={blocks}
            onChange={onBlocksChange}
            activeTextBlockRef={activeTextBlockRef}
            placeholder="Take a note…"
            onAddBlockReady={(fn) => {
              addBlockRef.current = fn;
            }}
          />
          {links.length > 0 && (
            <div className="note-link-previews">
              {links.map((url) => {
                const preview = linkPreviews.get(url);
                return preview ? <LinkPreviewCard key={url} preview={preview} /> : null;
              })}
            </div>
          )}
          <AttachmentsPanel
            attachments={attachments}
            onUpload={onUploadAttachment}
            onDelete={onDeleteAttachment}
            onInsertImage={(a) => insertEditorImage(activeTextBlockRef.current, a, updateActiveBlockHtml)}
          >
            <TextFormatToolbar
              editorRef={activeTextBlockRef}
              onChange={updateActiveBlockHtml}
              onAddText={() => addBlockRef.current?.('text')}
              onAddChecklist={() => addBlockRef.current?.('checklist')}
            />
          </AttachmentsPanel>
          {labelIds.length > 0 && (
            <div className="note-labels">
              {labelIds.map((id) => {
                const label = labels.find((l) => l.id === id);
                return label ? (
                  <span key={id} className={`note-label-chip note-label-chip-${label.color}`}>
                    {label.name}
                  </span>
                ) : null;
              })}
            </div>
          )}
          <div className="note-modal-timestamp">Edited {formatNoteDate(updatedAt, dateMode)}</div>
          <div className="note-modal-footer">
            <button type="button" title={locked ? 'Remove lock' : 'Lock this note'} onClick={locked ? onRequestRemoveLock : onRequestLock}>
              {locked ? <IconLockOpen /> : <IconLock />}
            </button>
            <button
              type="button"
              title="Color"
              onClick={() => {
                setShowColors((v) => !v);
                setShowLabels(false);
              }}
            >
              <IconPalette />
            </button>
            <button
              type="button"
              title="Collections"
              onClick={() => {
                setShowLabels((v) => !v);
                setShowColors(false);
              }}
            >
              <IconTag />
            </button>
            <button
              type="button"
              title="Archive"
              onClick={() => {
                close('fade');
                onArchive();
              }}
            >
              <IconArchive />
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => {
                close('fade');
                onTrash();
              }}
            >
              <IconTrash />
            </button>
            <button type="button" className="text-action" onClick={() => close()}>
              Done
            </button>
          </div>
          {showColors && (
            <div className="note-inline-picker">
              <ColorPicker
                value={color}
                onChange={(c) => {
                  onColorChange(c);
                  setShowColors(false);
                }}
              />
            </div>
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
        </>
      )}
    </FlipModal>
  );
}
