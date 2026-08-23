import { useRef, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { NoteModal } from './NoteModal';
import { MarkdownText } from './MarkdownText';
import { api } from '../api/client';
import { IconArchive, IconDragHandle, IconMic, IconPalette, IconPin, IconPinFilled, IconTag, IconTrash, IconVideo } from './Icons';
import type { Attachment, ChecklistItem, Label, Note, NoteColor, View } from '../types';

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
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived' | 'isChecklist' | 'items'>>,
  ) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
}

const CHECKLIST_PREVIEW_LIMIT = 6;
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
  onTrash,
  onRestore,
  onDelete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [sourceHidden, setSourceHidden] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [items, setItems] = useState<ChecklistItem[]>(note.items);
  const [attachments, setAttachments] = useState<Attachment[]>(note.attachments);
  const [labelIds, setLabelIds] = useState(note.labelIds);
  const [showLabels, setShowLabels] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const editable = view.kind === 'notes' || view.kind === 'archive' || view.kind === 'label';

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
    setTitle(note.title);
    setContent(note.content);
    setItems(note.items);
    setAttachments(note.attachments);
    setOriginRect(cardRef.current?.getBoundingClientRect() ?? null);
    setSourceHidden(true);
    setEditing(true);
  }

  function closeEditor() {
    const patch: Partial<Pick<Note, 'title' | 'content' | 'items'>> = {};
    if (title !== note.title) patch.title = title;
    if (!note.isChecklist && content !== note.content) patch.content = content;
    if (note.isChecklist && JSON.stringify(items) !== JSON.stringify(note.items)) {
      patch.items = items.filter((item) => item.text.trim().length > 0);
    }
    if (Object.keys(patch).length > 0) onUpdate(note.id, patch);
    setEditing(false);
    setOriginRect(null);
  }

  async function toggleLabel(labelId: string) {
    const attached = labelIds.includes(labelId);
    setLabelIds((prev) => (attached ? prev.filter((id) => id !== labelId) : [...prev, labelId]));
    try {
      if (attached) {
        await api.detachLabel(note.id, labelId);
      } else {
        await api.attachLabel(note.id, labelId);
      }
    } catch {
      setLabelIds(note.labelIds);
    }
  }

  async function uploadAttachment(file: File | Blob, filename?: string, waveformPeaks?: number[]) {
    const { attachment } = await api.uploadAttachment(note.id, file, filename, waveformPeaks);
    setAttachments((prev) => [...prev, attachment]);
  }

  async function deleteAttachment(attachmentId: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    try {
      await api.deleteAttachment(note.id, attachmentId);
    } catch {
      setAttachments(note.attachments);
    }
  }

  function toggleChecklistItem(itemId: string) {
    const updated = note.items.map((item) => (item.id === itemId ? { ...item, checked: !item.checked } : item));
    onUpdate(note.id, { items: updated });
  }

  const previewItems = note.items.slice(0, CHECKLIST_PREVIEW_LIMIT);
  const hiddenItemCount = note.items.length - previewItems.length;
  const coverImage = note.attachments.find((a) => a.kind === 'image');
  const videoCount = note.attachments.filter((a) => a.kind === 'video').length;
  const audioCount = note.attachments.filter((a) => a.kind === 'audio').length;

  return (
    <>
      <div
        ref={cardRef}
        className={`note-card color-${note.color} ${animateIn ? 'note-entering' : ''} ${leaving ? 'note-leaving' : ''} ${sourceHidden ? 'note-editing-source' : ''} ${selected ? 'note-selected' : ''}`}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {draggable && (
          <div className="note-drag-handle" title="Drag to reorder">
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

        <div onClick={openEditor}>
          {coverImage && (
            <div className="note-cover">
              <img src={coverImage.url} alt="" />
            </div>
          )}
          {(videoCount > 0 || audioCount > 0) && (
            <div className="note-media-badges">
              {videoCount > 0 && (
                <span className="note-media-badge">
                  <IconVideo width={14} height={14} /> {videoCount}
                </span>
              )}
              {audioCount > 0 && (
                <span className="note-media-badge">
                  <IconMic width={14} height={14} /> {audioCount}
                </span>
              )}
            </div>
          )}
          {note.title && <div className="note-title">{note.title}</div>}
          {note.isChecklist ? (
            <div className="note-checklist-preview">
              {previewItems.map((item) => (
                <label
                  key={item.id}
                  className={`checklist-row preview ${item.checked ? 'checked' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input type="checkbox" checked={item.checked} onChange={() => toggleChecklistItem(item.id)} />
                  <span>{item.text}</span>
                </label>
              ))}
              {hiddenItemCount > 0 && <div className="checklist-more">+{hiddenItemCount} more</div>}
            </div>
          ) : (
            note.content && (
              <div className="note-content">
                <MarkdownText text={note.content} />
              </div>
            )
          )}
          {labelIds.length > 0 && (
            <div className="note-labels">
              {labelIds.map((id) => {
                const label = labels.find((l) => l.id === id);
                return label ? (
                  <span key={id} className="note-label-chip">
                    {label.name}
                  </span>
                ) : null;
              })}
            </div>
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
      </div>

      {editing && originRect && (
        <NoteModal
          originRect={originRect}
          title={title}
          content={content}
          isChecklist={note.isChecklist}
          items={items}
          color={note.color as NoteColor}
          pinned={note.pinned}
          labels={labels}
          labelIds={labelIds}
          attachments={attachments}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onItemsChange={setItems}
          onColorChange={(color) => onUpdate(note.id, { color })}
          onTogglePin={() => onUpdate(note.id, { pinned: !note.pinned })}
          onToggleLabel={toggleLabel}
          onUploadAttachment={uploadAttachment}
          onDeleteAttachment={deleteAttachment}
          onArchive={() => leaveThen(() => onUpdate(note.id, { archived: !note.archived }))}
          onTrash={() => leaveThen(() => onTrash(note.id))}
          onClose={closeEditor}
          onCloseStart={() => setSourceHidden(false)}
        />
      )}
    </>
  );
}
