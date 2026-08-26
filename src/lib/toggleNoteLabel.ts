import { api } from '../api/client';

/** Optimistically attaches/detaches a label on a note, rolling back local state on failure --
 * shared by NoteCard (editing an existing note) and NoteComposer (a still-drafting one), which
 * otherwise each carried their own copy of this same attach/detach/rollback logic. */
export async function toggleNoteLabel(
  noteId: string,
  labelId: string,
  labelIds: string[],
  setLabelIds: (updater: (prev: string[]) => string[]) => void,
  rollback: () => void,
) {
  const attached = labelIds.includes(labelId);
  setLabelIds((prev) => (attached ? prev.filter((id) => id !== labelId) : [...prev, labelId]));
  try {
    if (attached) await api.detachLabel(noteId, labelId);
    else await api.attachLabel(noteId, labelId);
  } catch {
    rollback();
  }
}
