import { useRef, useState } from 'react';
import { FlipModal } from './FlipModal';
import { ColorPickerButton } from './ColorPickerButton';
import { ChecklistEditor } from './ChecklistEditor';
import { TextFormatToolbar } from './TextFormatToolbar';
import { AttachmentsPanel } from './AttachmentsPanel';
import { RichTextEditor } from './RichTextEditor';
import { IconArchive, IconClose, IconPin, IconPinFilled, IconTag, IconTrash } from './Icons';
import { useDateFormat } from '../hooks/useDateFormat';
import { formatNoteDate } from '../lib/formatDate';
import { insertEditorImage } from '../lib/insertEditorImage';
import type { Attachment, ChecklistItem, Label, NoteColor } from '../types';

interface Props {
  originRect: DOMRect;
  getOriginRect?: () => DOMRect | null;
  title: string;
  content: string;
  isChecklist: boolean;
  items: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  updatedAt: string;
  labels: Label[];
  labelIds: string[];
  attachments: Attachment[];
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onItemsChange: (items: ChecklistItem[]) => void;
  onColorChange: (color: NoteColor) => void;
  onTogglePin: () => void;
  onToggleLabel: (labelId: string) => void;
  onUploadAttachment: (file: File | Blob, filename?: string) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => void;
  onArchive: () => void;
  onTrash: () => void;
  onClose: () => void;
  onCloseStart: () => void;
}

export function NoteModal({
  originRect,
  getOriginRect,
  title,
  content,
  isChecklist,
  items,
  color,
  pinned,
  updatedAt,
  labels,
  labelIds,
  attachments,
  onTitleChange,
  onContentChange,
  onItemsChange,
  onColorChange,
  onTogglePin,
  onToggleLabel,
  onUploadAttachment,
  onDeleteAttachment,
  onArchive,
  onTrash,
  onClose,
  onCloseStart,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showLabels, setShowLabels] = useState(false);
  const { mode: dateMode } = useDateFormat();

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
            <button type="button" title={pinned ? 'Unpin' : 'Pin'} onClick={onTogglePin}>
              {pinned ? <IconPinFilled /> : <IconPin />}
            </button>
            <button type="button" title="Close" className="note-modal-close" onClick={() => close()}>
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
            <RichTextEditor
              ref={contentRef}
              className="note-content note-modal-content"
              placeholder="Take a note…"
              value={content}
              onChange={onContentChange}
            />
          )}
          <AttachmentsPanel
            attachments={attachments}
            onUpload={onUploadAttachment}
            onDelete={onDeleteAttachment}
            onInsertImage={isChecklist ? undefined : (a) => insertEditorImage(contentRef.current, a, onContentChange)}
          >
            {!isChecklist && <TextFormatToolbar editorRef={contentRef} onChange={onContentChange} />}
          </AttachmentsPanel>
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
          <div className="note-modal-timestamp">Edited {formatNoteDate(updatedAt, dateMode)}</div>
          <div className="note-modal-footer">
            <ColorPickerButton value={color} onChange={onColorChange} />
            <button type="button" title="Collections" onClick={() => setShowLabels((v) => !v)}>
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
        </>
      )}
    </FlipModal>
  );
}
