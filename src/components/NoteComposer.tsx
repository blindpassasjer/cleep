import { useRef, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { ChecklistEditor } from './ChecklistEditor';
import { TextFormatToolbar } from './TextFormatToolbar';
import { AttachmentsPanel } from './AttachmentsPanel';
import { api } from '../api/client';
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

export function NoteComposer({ onCreate, onUpdateDraft, onDiscardDraft }: Props) {
  const [expanded, setExpanded] = useState(false);
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
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setTitle('');
    setContent('');
    setItems([]);
    setColor('default');
    setIsChecklist(false);
    setAttachments([]);
    setDraftNoteId(null);
    setStartWith(null);
    setExpanded(false);
  }

  function startChecklist() {
    setIsChecklist(true);
    setItems([{ id: crypto.randomUUID(), text: '', checked: false }]);
    setExpanded(true);
  }

  function startWithImage() {
    setExpanded(true);
    setStartWith('image');
  }

  function startWithAudio() {
    setExpanded(true);
    setStartWith('audio');
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

  async function uploadAttachment(file: File | Blob, filename?: string) {
    const noteId = await ensureDraftNote();
    const { attachment } = await api.uploadAttachment(noteId, file, filename);
    setAttachments((prev) => [...prev, attachment]);
  }

  async function deleteAttachment(attachmentId: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    if (draftNoteId) await api.deleteAttachment(draftNoteId, attachmentId);
  }

  async function close() {
    const cleanedItems = items.filter((item) => item.text.trim().length > 0);
    const isEmpty = isChecklist ? cleanedItems.length === 0 && !title.trim() : !title.trim() && !content.trim();

    if (draftNoteId) {
      // The note already exists on the server (an attachment forced it into being) -- finalize it
      // rather than creating a second note.
      if (isEmpty && attachments.length === 0) {
        onDiscardDraft(draftNoteId);
      } else {
        onUpdateDraft(draftNoteId, {
          title: title.trim(),
          content: content.trim(),
          ...(isChecklist ? { isChecklist: true, items: cleanedItems } : {}),
        });
      }
      reset();
      return;
    }

    if (isEmpty) {
      reset();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreate(title.trim(), content.trim(), color, isChecklist ? { isChecklist: true, items: cleanedItems } : undefined);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <div className="composer collapsed">
        <span onClick={() => setExpanded(true)}>Take a note…</span>
        <div className="composer-collapsed-actions">
          <button type="button" title="New list" onClick={startChecklist}>
            <IconChecklist width={18} height={18} />
          </button>
          <button type="button" title="Add image" onClick={startWithImage}>
            <IconImage width={18} height={18} />
          </button>
          <button type="button" title="Record audio" onClick={startWithAudio}>
            <IconMic width={18} height={18} />
          </button>
          <IconPlus className="composer-plus" onClick={() => setExpanded(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className={`composer expanded color-${color}`}>
      <input
        className="composer-title"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={startWith === null}
      />
      {isChecklist ? (
        <ChecklistEditor items={items} onChange={setItems} autoFocusLast />
      ) : (
        <>
          <textarea
            ref={contentRef}
            className="composer-content"
            placeholder="Take a note…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
          <TextFormatToolbar textareaRef={contentRef} value={content} onChange={setContent} />
        </>
      )}
      <AttachmentsPanel
        attachments={attachments}
        onUpload={uploadAttachment}
        onDelete={deleteAttachment}
        autoOpenFilePicker={startWith === 'image'}
        autoStartRecording={startWith === 'audio'}
      />
      {error && <div className="composer-error">{error}</div>}
      <div className="composer-footer">
        <ColorPicker value={color} onChange={setColor} />
        <button type="button" onClick={close} disabled={saving}>
          {saving ? 'Saving…' : 'Close'}
        </button>
      </div>
    </div>
  );
}
