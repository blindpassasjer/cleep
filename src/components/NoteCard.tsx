import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { NoteModal } from './NoteModal';
import { LockModal, type LockModalMode } from './LockModal';
import { MiniWaveform } from './MiniWaveform';
import { LinkPreviewCard } from './LinkPreviewCard';
import { ChecklistPreviewBlock } from './ChecklistPreviewBlock';
import { api } from '../api/client';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { extractLinks } from '../lib/extractLinks';
import { useLinkPreviews } from '../hooks/useLinkPreviews';
import { toggleNoteLabel } from '../lib/toggleNoteLabel';
import { IconArchive, IconDragHandle, IconLock, IconMic, IconPalette, IconPin, IconPinFilled, IconTag, IconTrash, IconVideo } from './Icons';
import type { Attachment, Label, Note, NoteBlock, NoteColor, View } from '../types';

interface Props {
  note: Note;
  view: View;
  labels: Label[];
  animateIn: boolean;
  selected: boolean;
  selectionActive: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'blocks' | 'color' | 'pinned' | 'archived'>>,
    options?: { password?: string },
  ) => void;
  onLock: (id: string, password: string, extra?: { blocks?: NoteBlock[]; title?: string }) => Promise<Note>;
  onRemoveLock: (id: string, password: string) => Promise<Note>;
  onAttachmentsChange: (id: string, attachments: Attachment[]) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}

const EXIT_ANIMATION_MS = 160;

export function NoteCard({
  note,
  view,
  labels,
  animateIn,
  selected,
  selectionActive,
  onToggleSelect,
  onUpdate,
  onLock,
  onRemoveLock,
  onAttachmentsChange,
  onTrash,
  onRestore,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyTruncated, setBodyTruncated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sourceHidden, setSourceHidden] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [title, setTitle] = useState(note.title);
  const [blocks, setBlocks] = useState<NoteBlock[]>(note.blocks);
  const [attachments, setAttachments] = useState<Attachment[]>(note.attachments);
  // Mirrors `attachments` synchronously so uploadAttachment/deleteAttachment can read the latest
  // value without a stale closure over React state (matches the same pattern in NoteComposer).
  const attachmentsRef = useRef<Attachment[]>(note.attachments);
  const [labelIds, setLabelIds] = useState(note.labelIds);
  const [showLabels, setShowLabels] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set only for the duration this note is open, from a successful password entry -- never
  // persisted, never sent anywhere except this note's own save/lock calls (see closeEditor). There
  // is no server-side "unlocked" session state, so this is the only place that knowledge lives.
  const [unlockPassword, setUnlockPassword] = useState<string | null>(null);
  const [lockModalMode, setLockModalMode] = useState<LockModalMode | null>(null);
  const editable = view.kind === 'notes' || view.kind === 'recordings' || view.kind === 'archive' || view.kind === 'label';

  function leaveThen(action: () => void) {
    setLeaving(true);
    setTimeout(action, EXIT_ANIMATION_MS);
  }

  function openEditor() {
    if (selectionActive) {
      onToggleSelect(note.id);
      return;
    }
    if (!editable) return;
    if (note.locked) {
      setLockModalMode('enter');
      return;
    }
    setTitle(note.title);
    setBlocks(note.blocks);
    setAttachments(note.attachments);
    attachmentsRef.current = note.attachments;
    setOriginRect(cardRef.current?.getBoundingClientRect() ?? null);
    setSourceHidden(true);
    setEditing(true);
  }

  function releaseAttachmentBlobUrls() {
    for (const a of attachmentsRef.current) {
      if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url);
    }
  }

  function closeEditor() {
    const patch: Partial<Pick<Note, 'title' | 'blocks'>> = {};
    if (title !== note.title) patch.title = title;
    // Drop empty checklist items on close, same trim the composer applies -- an item left blank
    // while typing shouldn't stick around as a permanent empty row. A locked note's own `blocks`
    // (as seen by the parent) is always `[]`, so it can never tell us "nothing changed" -- always
    // include blocks in the save for a locked note rather than diffing against that placeholder.
    const trimmedBlocks = blocks.map((b) => (b.type === 'checklist' ? { ...b, items: b.items.filter((i) => i.text.trim().length > 0) } : b));
    if (note.locked || JSON.stringify(trimmedBlocks) !== JSON.stringify(note.blocks)) patch.blocks = trimmedBlocks;
    if (Object.keys(patch).length > 0) onUpdate(note.id, patch, note.locked && unlockPassword ? { password: unlockPassword } : undefined);
    if (note.locked) releaseAttachmentBlobUrls();
    setEditing(false);
    setOriginRect(null);
    setUnlockPassword(null);
  }

  async function unlockToView(password: string) {
    const { blocks: decryptedBlocks, attachments: rawAttachments } = await api.unlockNote(note.id, password);
    const resolvedAttachments = await Promise.all(
      rawAttachments.map(async (a) => {
        try {
          const blob = await api.unlockAttachment(note.id, a.id, password);
          return { ...a, url: URL.createObjectURL(blob) };
        } catch {
          return a; // leave the (blocked) original url rather than failing the whole unlock over one file
        }
      }),
    );
    setTitle(note.title);
    setBlocks(decryptedBlocks);
    setAttachments(resolvedAttachments);
    attachmentsRef.current = resolvedAttachments;
    setUnlockPassword(password);
    setOriginRect(cardRef.current?.getBoundingClientRect() ?? null);
    setSourceHidden(true);
    setEditing(true);
  }

  async function lockNow(password: string) {
    const trimmedBlocks = blocks.map((b) => (b.type === 'checklist' ? { ...b, items: b.items.filter((i) => i.text.trim().length > 0) } : b));
    await onLock(note.id, password, { blocks: trimmedBlocks, title });
    // Bypasses FlipModal's own close() (this runs from the LockModal overlay, not from inside
    // NoteModal's render-prop scope where `close` lives) -- so it has to redo the cleanup
    // closeEditor would otherwise have done, or the source card stays hidden forever and this
    // session's attachment blob URLs leak.
    releaseAttachmentBlobUrls();
    setEditing(false);
    setOriginRect(null);
    setSourceHidden(false);
    setUnlockPassword(null);
  }

  async function removeLockNow(password: string) {
    const updated = await onRemoveLock(note.id, password);
    releaseAttachmentBlobUrls(); // drop this session's decrypt-to-view blob URLs; the note now has real server ones
    setTitle(updated.title);
    setBlocks(updated.blocks);
    setAttachments(updated.attachments);
    attachmentsRef.current = updated.attachments;
    setUnlockPassword(null);
  }

  async function submitLockModal(password: string) {
    if (lockModalMode === 'enter') await unlockToView(password);
    else if (lockModalMode === 'set') await lockNow(password);
    else if (lockModalMode === 'remove') await removeLockNow(password);
    setLockModalMode(null);
  }

  async function toggleLabel(labelId: string) {
    await toggleNoteLabel(note.id, labelId, labelIds, setLabelIds, () => setLabelIds(note.labelIds));
  }

  async function uploadAttachment(file: File | Blob, filename?: string, waveformPeaks?: number[]) {
    const { attachment } = await api.uploadAttachment(note.id, file, filename, waveformPeaks);
    const next = [...attachmentsRef.current, attachment];
    attachmentsRef.current = next;
    setAttachments(next);
    onAttachmentsChange(note.id, next);
  }

  async function deleteAttachment(attachmentId: string) {
    const next = attachmentsRef.current.filter((a) => a.id !== attachmentId);
    attachmentsRef.current = next;
    setAttachments(next);
    try {
      await api.deleteAttachment(note.id, attachmentId);
      onAttachmentsChange(note.id, next);
    } catch {
      attachmentsRef.current = note.attachments;
      setAttachments(note.attachments);
    }
  }

  const coverImage = note.attachments.find((a) => a.kind === 'image');
  const videoCount = note.attachments.filter((a) => a.kind === 'video').length;
  const firstAudio = note.attachments.find((a) => a.kind === 'audio');
  const audioCount = note.attachments.filter((a) => a.kind === 'audio').length;
  const textHtml = useMemo(() => note.blocks.filter((b) => b.type === 'text').map((b) => b.html).join('\n'), [note.blocks]);
  const links = useMemo(() => extractLinks({ title: note.title, content: textHtml }), [note.title, textHtml]);
  const linkPreviews = useLinkPreviews(links);

  // The fade at the bottom of .note-body should only show up when content is actually clipped by
  // its max-height -- otherwise a normal, short note would have its last couple of lines needlessly
  // dimmed by a fixed-height gradient that assumes there's more below it. Re-measured whenever the
  // note's own text/checklist/title changes, and on any inline image finishing a late load (those
  // fire "load" on the <img> itself, which doesn't bubble, hence the capture-phase listener).
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    function measure() {
      if (el) setBodyTruncated(el.scrollHeight - el.clientHeight > 1);
    }
    measure();
    el.addEventListener('load', measure, true);
    return () => el.removeEventListener('load', measure, true);
  }, [note.title, note.blocks, note.attachments, labelIds, links]);

  return (
    <>
      <div
        ref={cardRef}
        className={`note-card color-${note.color} ${animateIn ? 'note-entering' : ''} ${leaving ? 'note-leaving' : ''} ${sourceHidden ? 'note-editing-source' : ''} ${selected ? 'note-selected' : ''}`}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={openEditor}
      >
        {draggable && (
          <div className="note-drag-handle" title="Drag to reorder" onClick={(e) => e.stopPropagation()}>
            <IconDragHandle width={14} height={14} />
          </div>
        )}
        <button
          type="button"
          className={`note-select-toggle ${selectionActive || selected ? 'visible' : ''}`}
          title={selected ? 'Deselect' : 'Select'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(note.id);
          }}
        >
          <span className={`select-checkbox ${selected ? 'checked' : ''}`} />
        </button>

        <div>
          {coverImage && (
            <div className="note-cover">
              <img src={coverImage.url} alt="" />
            </div>
          )}
          <div className={`note-body ${bodyTruncated ? 'note-body-truncated' : ''}`} ref={bodyRef}>
            {videoCount > 0 && (
              <div className="note-media-badges">
                <span className="note-media-badge">
                  <IconVideo width={14} height={14} /> {videoCount}
                </span>
              </div>
            )}
            {note.title && <div className="note-title">{note.title}</div>}
            {note.locked ? (
              <div className="note-locked-placeholder">
                <IconLock width={20} height={20} />
                <span>Locked note</span>
              </div>
            ) : (
              note.blocks.map((block) =>
                block.type === 'checklist' ? (
                  block.items.length > 0 && <ChecklistPreviewBlock key={block.id} items={block.items} />
                ) : (
                  block.html && (
                    <div key={block.id} className="note-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html) }} />
                  )
                ),
              )
            )}
          </div>
          {links.length > 0 && (
            <div className="note-link-previews">
              {links.map((url) => {
                const preview = linkPreviews.get(url);
                return preview ? <LinkPreviewCard key={url} preview={preview} compact /> : null;
              })}
            </div>
          )}
          {/* Outside .note-body (not its last child) -- that box clips to a fixed max-height (see
              .note-body in index.css) for long notes, which was cutting labels off along with the
              overflowing text instead of leaving them visible below the fade. */}
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
        </div>

        {firstAudio && (
          <div className="note-audio-preview">
            <IconMic width={14} height={14} />
            <MiniWaveform peaks={firstAudio.waveformPeaks} />
            {audioCount > 1 && <span className="note-audio-count">+{audioCount - 1}</span>}
          </div>
        )}

        <div className="note-footer">
          {view.kind === 'trash' ? (
            <>
              <button type="button" className="text-action" onClick={() => leaveThen(() => onRestore(note.id))}>
                Restore
              </button>
              <button type="button" className="text-action" onClick={() => leaveThen(() => onDelete(note.id))}>
                Delete forever
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                title={note.pinned ? 'Unpin' : 'Pin'}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(note.id, { pinned: !note.pinned });
                }}
              >
                {note.pinned ? <IconPinFilled /> : <IconPin />}
              </button>
              <button
                type="button"
                title="Color"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColors((v) => !v);
                  setShowLabels(false);
                }}
              >
                <IconPalette />
              </button>
              <button
                type="button"
                title="Collections"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLabels((v) => !v);
                  setShowColors(false);
                }}
              >
                <IconTag />
              </button>
              <button
                type="button"
                title={note.archived ? 'Unarchive' : 'Archive'}
                onClick={(e) => {
                  e.stopPropagation();
                  leaveThen(() => onUpdate(note.id, { archived: !note.archived }));
                }}
              >
                <IconArchive />
              </button>
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  leaveThen(() => onTrash(note.id));
                }}
              >
                <IconTrash />
              </button>
            </>
          )}
        </div>

        {showColors && editable && (
          <div className="note-inline-picker" onClick={(e) => e.stopPropagation()}>
            <ColorPicker
              value={note.color as NoteColor}
              onChange={(color) => {
                onUpdate(note.id, { color });
                setShowColors(false);
              }}
            />
          </div>
        )}

        {showLabels && editable && (
          <div className="note-labels-editor" onClick={(e) => e.stopPropagation()}>
            {labels.length === 0 && <span className="note-labels-empty">No collections yet.</span>}
            {labels.map((label) => (
              <label key={label.id} className="note-label-toggle">
                <input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => toggleLabel(label.id)} />
                {label.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {editing && originRect && (
        <NoteModal
          originRect={originRect}
          getOriginRect={() => cardRef.current?.getBoundingClientRect() ?? null}
          title={title}
          blocks={blocks}
          updatedAt={note.updatedAt}
          color={note.color as NoteColor}
          pinned={note.pinned}
          locked={note.locked}
          labels={labels}
          labelIds={labelIds}
          attachments={attachments}
          onTitleChange={setTitle}
          onBlocksChange={setBlocks}
          onColorChange={(color) => onUpdate(note.id, { color })}
          onTogglePin={() => onUpdate(note.id, { pinned: !note.pinned })}
          onToggleLabel={toggleLabel}
          onUploadAttachment={uploadAttachment}
          onDeleteAttachment={deleteAttachment}
          onRequestLock={() => setLockModalMode('set')}
          onRequestRemoveLock={() => setLockModalMode('remove')}
          onArchive={() => leaveThen(() => onUpdate(note.id, { archived: !note.archived }))}
          onTrash={() => leaveThen(() => onTrash(note.id))}
          onClose={closeEditor}
          onCloseStart={() => setSourceHidden(false)}
        />
      )}

      {lockModalMode && <LockModal mode={lockModalMode} onSubmit={submitLockModal} onClose={() => setLockModalMode(null)} />}
    </>
  );
}
