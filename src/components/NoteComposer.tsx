import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { FlipModal, type CloseFn } from './FlipModal';
import { ColorPickerButton } from './ColorPickerButton';
import { ChecklistEditor } from './ChecklistEditor';
import { TextFormatToolbar } from './TextFormatToolbar';
import { AttachmentsPanel } from './AttachmentsPanel';
import { RichTextEditor } from './RichTextEditor';
import { api } from '../api/client';
import { insertEditorImage } from '../lib/insertEditorImage';
import { isRichContentEmpty } from '../lib/isRichContentEmpty';
import { toggleNoteLabel } from '../lib/toggleNoteLabel';
import { IconArchive, IconChecklist, IconImage, IconMic, IconPlus, IconTag, IconTrash } from './Icons';
import type { Attachment, ChecklistItem, Label, Note, NoteColor } from '../types';

interface Props {
  onCreate: (
    title: string,
    content: string,
    color: NoteColor,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[] },
  ) => Promise<Note>;
  onUpdateDraft: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'isChecklist' | 'items'>>) => void;
  onDiscardDraft: (id: string) => void;
  labels: Label[];
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
}

export interface NoteComposerHandle {
  open: () => void;
  openChecklist: () => void;
}

export const NoteComposer = forwardRef<NoteComposerHandle, Props>(function NoteComposer(
  { onCreate, onUpdateDraft, onDiscardDraft, labels, onArchive, onTrash },
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
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(false);
  const [startWith, setStartWith] = useState<'image' | 'audio' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // draftNoteId/attachments only need to exist as refs, not state -- nothing renders off them
  // directly (the note gets its title/content/attachments back via re-fetch once saved). Keeping
  // them as refs means attemptClose can read the *current* value synchronously right after awaiting
  // any in-flight upload, where a closure over React state would still see the pre-await snapshot.
  const draftNoteIdRef = useRef<string | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  const pendingUploadsRef = useRef<Set<Promise<void>>>(new Set());

  function open(startWithMode: 'image' | 'audio' | null = null, originEl?: HTMLElement | null) {
    setOriginRect((originEl ?? collapsedRef.current)?.getBoundingClientRect() ?? null);
    setStartWith(startWithMode);
    setExpanded(true);
  }

  useImperativeHandle(handleRef, () => ({ open: () => open(), openChecklist: () => startChecklist() }));

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
    setLabelIds([]);
    setShowLabels(false);
    draftNoteIdRef.current = null;
    attachmentsRef.current = [];
    setStartWith(null);
    setExpanded(false);
    setOriginRect(null);
  }

  // Attachments belong to a note, so the first one made while composing forces the note into
  // existence early (with whatever title/content/checklist state exists at that moment) — the rest
  // of the composer keeps editing that same note instead of building up a separate draft.
  async function ensureDraftNote(): Promise<string> {
    if (draftNoteIdRef.current) return draftNoteIdRef.current;
    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const note = await onCreate(title.trim(), content.trim(), color, isChecklist ? { isChecklist: true, items: cleanedItems } : undefined);
    draftNoteIdRef.current = note.id;
    return note.id;
  }

  // Same "force the note into existence early" reasoning as attachments above -- collections can't
  // attach to a note that doesn't exist on the server yet.
  async function toggleLabel(labelId: string) {
    const noteId = await ensureDraftNote();
    const wasAttached = labelIds.includes(labelId);
    await toggleNoteLabel(noteId, labelId, labelIds, setLabelIds, () =>
      setLabelIds((prev) => (wasAttached ? [...prev, labelId] : prev.filter((id) => id !== labelId))),
    );
  }

  // Archive/delete bypass attemptClose's save-or-discard logic entirely -- the user has made an
  // explicit choice here, not just dismissed the composer, so an empty title/content shouldn't
  // cause it to be silently discarded instead. 'fade' (not the default flip-back-to-origin
  // animation) matches NoteModal's own archive/trash buttons, since the composer's origin element
  // may no longer represent where this note is going.
  //
  // If nothing has actually been saved yet (no draft, no title/content/items, no attachments),
  // there's nothing on the server to archive/trash -- ensureDraftNote() would otherwise create a
  // note just to immediately archive/discard it, two round trips for a no-op.
  async function finishDraftNote(close: CloseFn, action: (id: string) => void) {
    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const isEmpty = isChecklist ? cleanedItems.length === 0 && !title.trim() : !title.trim() && isRichContentEmpty(content);
    if (!draftNoteIdRef.current && isEmpty && attachmentsRef.current.length === 0) {
      close('fade');
      return;
    }
    const noteId = await ensureDraftNote();
    close('fade');
    action(noteId);
  }

  // Tracked as a pending promise so attemptClose (Close button, Escape, and backdrop-click all
  // share it) can wait for any recording/upload still in flight before deciding the note is empty
  // and discarding it -- otherwise closing right after "stop recording" could delete the draft note
  // out from under an upload that hadn't finished yet, silently losing the recording.
  async function uploadAttachment(file: File | Blob, filename?: string, waveformPeaks?: number[]) {
    const task = (async () => {
      const noteId = await ensureDraftNote();
      const { attachment } = await api.uploadAttachment(noteId, file, filename, waveformPeaks);
      attachmentsRef.current = [...attachmentsRef.current, attachment];
      setAttachments(attachmentsRef.current);
    })();
    pendingUploadsRef.current.add(task);
    try {
      await task;
    } finally {
      pendingUploadsRef.current.delete(task);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    attachmentsRef.current = attachmentsRef.current.filter((a) => a.id !== attachmentId);
    setAttachments(attachmentsRef.current);
    if (draftNoteIdRef.current) await api.deleteAttachment(draftNoteIdRef.current, attachmentId);
  }

  // Shared by the Close button, Escape, and backdrop-click: try to save (when there's anything to
  // save) and only actually animate the modal away on success, so a failed create leaves the modal
  // open with the error and the user's text/attachments intact instead of losing them.
  async function attemptClose(close: CloseFn) {
    if (pendingUploadsRef.current.size > 0) {
      await Promise.all(pendingUploadsRef.current);
    }

    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const isEmpty = isChecklist ? cleanedItems.length === 0 && !title.trim() : !title.trim() && isRichContentEmpty(content);
    const draftId = draftNoteIdRef.current;

    if (draftId) {
      // The note already exists on the server (an attachment forced it into being) -- finalize it
      // rather than creating a second note. This mutation is fire-and-forget, same as editing an
      // existing note elsewhere in the app, so it's safe to close immediately.
      if (isEmpty && attachmentsRef.current.length === 0) {
        onDiscardDraft(draftId);
      } else {
        onUpdateDraft(draftId, {
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
          {showLabels && (
            <div className="note-labels-editor">
              {labels.length === 0 && <span className="note-labels-empty">No collections yet.</span>}
              {labels.map((label) => (
                <label key={label.id} className="note-label-toggle">
                  <input type="checkbox" checked={labelIds.includes(label.id)} onChange={() => toggleLabel(label.id)} />
                  {label.name}
                </label>
              ))}
            </div>
          )}
          {error && <div className="composer-error">{error}</div>}
          <div className="note-modal-footer">
            <ColorPickerButton value={color} onChange={setColor} />
            <button type="button" title="Collections" onClick={() => setShowLabels((v) => !v)}>
              <IconTag />
            </button>
            <button type="button" title="Archive" onClick={() => finishDraftNote(close, onArchive)}>
              <IconArchive />
            </button>
            <button type="button" title="Delete" onClick={() => finishDraftNote(close, onTrash)}>
              <IconTrash />
            </button>
            <button type="button" className="text-action" onClick={() => attemptClose(close)} disabled={saving}>
              {saving ? 'Saving…' : 'Close'}
            </button>
          </div>
        </>
      )}
    </FlipModal>
  );
});
