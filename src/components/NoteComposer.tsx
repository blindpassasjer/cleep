import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { FlipModal, type CloseFn } from './FlipModal';
import { ColorPicker } from './ColorPicker';
import { ChecklistEditor } from './ChecklistEditor';
import { TextFormatToolbar } from './TextFormatToolbar';
import { AttachmentsPanel } from './AttachmentsPanel';
import { RichTextEditor } from './RichTextEditor';
import { api } from '../api/client';
import { insertEditorImage } from '../lib/insertEditorImage';
import { isRichContentEmpty } from '../lib/isRichContentEmpty';
import { IconChecklist, IconImage, IconMic, IconPlus } from './Icons';
import type { Attachment, ChecklistItem, Note, NoteColor } from '../types';

interface Props {
  onCreate: (
    title: string,
    content: string,
    color: NoteColor,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[] },
  ) => Promise<Note>;
  onUpdateDraft: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'isChecklist' | 'items'>>) => void;
  onDiscardDraft: (id: string) => void;
}

export interface NoteComposerHandle {
  open: () => void;
}

export const NoteComposer = forwardRef<NoteComposerHandle, Props>(function NoteComposer(
  { onCreate, onUpdateDraft, onDiscardDraft },
  handleRef,
) {
  const collapsedRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [isChecklist, setIsChecklist] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [color, setColor] = useState<NoteColor>('default');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftNoteId, setDraftNoteId] = useState<string | null>(null);
  const [startWith, setStartWith] = useState<'image' | 'audio' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function open(startWithMode: 'image' | 'audio' | null = null, originEl?: HTMLElement | null) {
    setOriginRect((originEl ?? collapsedRef.current)?.getBoundingClientRect() ?? null);
    setStartWith(startWithMode);
    setExpanded(true);
  }

  useImperativeHandle(handleRef, () => ({ open: () => open() }));

  function startChecklist() {
    setIsChecklist(true);
    setItems([{ id: crypto.randomUUID(), text: '', checked: false }]);
    open();
  }

  // Called once the close animation has fully finished -- safe to tear down all state now that
  // nothing is still visible mid-flight.
  function finalize() {
    setTitle('');
    setContent('');
    setItems([]);
    setColor('default');
    setIsChecklist(false);
    setAttachments([]);
    setDraftNoteId(null);
    setStartWith(null);
    setExpanded(false);
    setOriginRect(null);
  }

  // Attachments belong to a note, so the first one made while composing forces the note into
  // existence early (with whatever title/content/checklist state exists at that moment) — the rest
  // of the composer keeps editing that same note instead of building up a separate draft.
  async function ensureDraftNote(): Promise<string> {
    if (draftNoteId) return draftNoteId;
    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const note = await onCreate(title.trim(), content.trim(), color, isChecklist ? { isChecklist: true, items: cleanedItems } : undefined);
    setDraftNoteId(note.id);
    return note.id;
  }

  async function uploadAttachment(file: File | Blob, filename?: string, waveformPeaks?: number[]) {
    const noteId = await ensureDraftNote();
    const { attachment } = await api.uploadAttachment(noteId, file, filename, waveformPeaks);
    setAttachments((prev) => [...prev, attachment]);
  }

  async function deleteAttachment(attachmentId: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    if (draftNoteId) await api.deleteAttachment(draftNoteId, attachmentId);
  }

  // Shared by the Close button, Escape, and backdrop-click: try to save (when there's anything to
  // save) and only actually animate the modal away on success, so a failed create leaves the modal
  // open with the error and the user's text/attachments intact instead of losing them.
  async function attemptClose(close: CloseFn) {
    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const isEmpty = isChecklist ? cleanedItems.length === 0 && !title.trim() : !title.trim() && isRichContentEmpty(content);

    if (draftNoteId) {
      // The note already exists on the server (an attachment forced it into being) -- finalize it
      // rather than creating a second note. This mutation is fire-and-forget, same as editing an
      // existing note elsewhere in the app, so it's safe to close immediately.
      if (isEmpty && attachments.length === 0) {
        onDiscardDraft(draftNoteId);
      } else {
        onUpdateDraft(draftNoteId, {
          title: title.trim(),
          content: content.trim(),
          ...(isChecklist ? { isChecklist: true, items: cleanedItems } : {}),
        });
      }
      close();
      return;
    }

    if (isEmpty) {
      close();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(title.trim(), content.trim(), color, isChecklist ? { isChecklist: true, items: cleanedItems } : undefined);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <>
        <div className="composer collapsed" ref={collapsedRef}>
          <span onClick={() => open()}>Take a note…</span>
          <div className="composer-collapsed-actions">
            <button type="button" title="New list" onClick={startChecklist}>
              <IconChecklist width={18} height={18} />
            </button>
            <button type="button" title="Add image" onClick={() => open('image')}>
              <IconImage width={18} height={18} />
            </button>
            <button type="button" title="Record audio" onClick={() => open('audio')}>
              <IconMic width={18} height={18} />
            </button>
            <IconPlus className="composer-plus" onClick={() => open()} />
          </div>
        </div>
        {/* Mobile only (see CSS): the compose bar scrolls away with the notes grid on phones, same
            as Google Keep's mobile app, so a fixed FAB keeps "new note" reachable at all times. */}
        <button type="button" className="composer-fab" title="New note" ref={fabRef} onClick={() => open(null, fabRef.current)}>
          <IconPlus width={26} height={26} />
        </button>
      </>
    );
  }

  if (!originRect) return null;

  return (
    <FlipModal originRect={originRect} panelClassName={`color-${color}`} onClose={finalize} onRequestClose={attemptClose}>
      {(close) => (
        <>
          <input
            className="composer-title"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {isChecklist ? (
            <ChecklistEditor items={items} onChange={setItems} autoFocusLast />
          ) : (
            <RichTextEditor
              ref={contentRef}
              className="note-content note-modal-content"
              placeholder="Take a note…"
              value={content}
              onChange={setContent}
              autoFocus={startWith === null}
            />
          )}
          <AttachmentsPanel
            attachments={attachments}
            onUpload={uploadAttachment}
            onDelete={deleteAttachment}
            autoOpenFilePicker={startWith === 'image'}
            autoStartRecording={startWith === 'audio'}
            onInsertImage={isChecklist ? undefined : (a) => insertEditorImage(contentRef.current, a, setContent)}
          >
            {!isChecklist && <TextFormatToolbar editorRef={contentRef} onChange={setContent} />}
          </AttachmentsPanel>
          {error && <div className="composer-error">{error}</div>}
          <div className="note-modal-footer">
            <ColorPicker value={color} onChange={setColor} />
            <button type="button" className="text-action" onClick={() => attemptClose(close)} disabled={saving}>
              {saving ? 'Saving…' : 'Close'}
            </button>
          </div>
        </>
      )}
    </FlipModal>
  );
});
