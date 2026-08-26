import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ChecklistItem, Note, NoteColor, View } from '../types';
import type { NotifyFn } from './useToast';

const DELETE_UNDO_MS = 5000;
const FIRST_PAGE_SIZE = 30;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function useNotes(view: View, notify: NotifyFn, enabled: boolean) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Bumped on every reload() call so a background page-2 fetch that resolves after a newer
  // reload() has already started (view switched, search cleared, etc.) knows to discard itself
  // instead of merging stale notes into the current view.
  const requestIdRef = useRef(0);

  // `enabled` (whether a user is actually logged in yet) has to be a dependency here, not just
  // `view` -- otherwise this hook's very first render (App mounts it unconditionally, before
  // useAuth's initial /auth/me check has resolved) fires the effect below once against an
  // unauthenticated session, and since `view` never changes across the login transition, nothing
  // ever prompts a retry: notes silently never load until the user happens to change views.
  //
  // Loads in two phases: a small first page so the grid paints quickly, then the rest of the
  // notes in the background, merged in once they arrive. Search and drag-reorder both operate on
  // whatever's in `notes` regardless of how many pages have landed, so this only affects how fast
  // the first paint shows up -- not correctness.
  const reload = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    let firstPage: Note[];
    try {
      ({ notes: firstPage } = await api.listNotes(view, { limit: FIRST_PAGE_SIZE }));
    } catch (err) {
      if (requestId === requestIdRef.current) setError(errorMessage(err));
      return;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
    if (requestId !== requestIdRef.current) return;
    setNotes(firstPage);

    if (firstPage.length === FIRST_PAGE_SIZE) {
      try {
        const { notes: rest } = await api.listNotes(view, { offset: FIRST_PAGE_SIZE });
        if (requestId === requestIdRef.current && rest.length > 0) {
          setNotes((prev) => [...prev, ...rest]);
        }
      } catch (err) {
        if (requestId === requestIdRef.current) setError(errorMessage(err));
      }
    }
  }, [view, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  // If the tab is closed/navigated away during the undo window, the setTimeout below never gets a
  // chance to fire, silently leaving "permanently deleted" notes still on the server. `pagehide`
  // fires reliably in that case (unlike `beforeunload`, which some browsers skip on mobile/bfcache
  // navigations) -- flush every pending delete immediately with `keepalive` so it survives the
  // page tearing down mid-request.
  useEffect(() => {
    const flushPendingDeletes = () => {
      for (const [id, timeoutId] of pendingDeletes.current) {
        clearTimeout(timeoutId);
        void api.deleteNote(id, { keepalive: true });
      }
      pendingDeletes.current.clear();
    };
    window.addEventListener('pagehide', flushPendingDeletes);
    return () => window.removeEventListener('pagehide', flushPendingDeletes);
  }, []);

  async function createNote(
    title: string,
    content: string,
    color: NoteColor,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[]; isRecording?: boolean },
  ): Promise<Note> {
    setError(null);
    try {
      const { note } = await api.createNote(title, content, color, extra);
      // Explicit "this one just got created" signal for the entrance animation -- distinct from
      // every other reload() (view switches, search, undo, background sync), which shouldn't
      // replay the pop-in for the whole grid. Cleared once the grid's had a chance to notice.
      setJustCreatedId(note.id);
      setTimeout(() => setJustCreatedId((current) => (current === note.id ? null : current)), 1000);
      // Splice the new note straight into local state instead of refetching the whole list --
      // the composer/recorder only mount for the view the note is created into (see App.tsx), so
      // it always belongs here. New notes are never pinned, so it slots in right after the
      // pinned block, ahead of the rest (it has the highest `position` of any unpinned note).
      setNotes((prev) => {
        const insertAt = prev.findIndex((n) => !n.pinned);
        const idx = insertAt === -1 ? prev.length : insertAt;
        return [...prev.slice(0, idx), note, ...prev.slice(idx)];
      });
      return note;
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }

  async function discardDraftNote(id: string) {
    try {
      await api.deleteNote(id);
    } finally {
      await reload();
    }
  }

  async function updateNote(
    id: string,
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived' | 'isChecklist' | 'items' | 'position'>>,
  ) {
    setError(null);
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      await api.updateNote(id, patch);
      if (patch.archived !== undefined) {
        // Archiving/unarchiving always moves the note out of whatever view it's currently shown
        // in (the notes list is already scoped server-side to one view), so drop it locally
        // instead of refetching the full list to find out it's gone.
        setNotes((prev) => prev.filter((n) => n.id !== id));
        notify(patch.archived ? 'Note archived' : 'Note unarchived', {
          onUndo: async () => {
            await api.updateNote(id, { archived: !patch.archived });
            await reload();
          },
        });
      }
    } catch (err) {
      setError(errorMessage(err));
      await reload();
    }
  }

  // Attachment uploads/deletes hit the server directly from NoteCard (not through updateNote), so
  // nothing else keeps this hook's `notes` array in sync with them. Without this, the in-memory
  // note a reopened NoteCard resets its local attachment state from is stale, making a
  // just-uploaded image (already saved server-side) look like it never saved until the next reload().
  function setNoteAttachments(id: string, attachments: Note['attachments']) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, attachments } : n)));
  }

  async function reorderNotes(orderedIds: string[]) {
    // Descending positions so the existing `orderBy(desc(position))` on the server keeps this order.
    const base = Date.now();
    const updates = orderedIds.map((id, index) => ({ id, position: base - index }));
    setNotes((prev) => {
      const positionById = new Map(updates.map((u) => [u.id, u.position]));
      return [...prev].sort((a, b) => (positionById.get(b.id) ?? b.position) - (positionById.get(a.id) ?? a.position));
    });
    try {
      await Promise.all(updates.map((u) => api.updateNote(u.id, { position: u.position })));
    } catch (err) {
      setError(errorMessage(err));
      await reload();
    }
  }

  async function trashNote(id: string) {
    setError(null);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.trashNote(id);
      notify('Note moved to trash', {
        onUndo: async () => {
          await api.restoreNote(id);
          await reload();
        },
      });
    } catch (err) {
      setError(errorMessage(err));
      await reload();
    }
  }

  async function restoreNote(id: string) {
    setError(null);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.restoreNote(id);
      notify('Note restored', {
        onUndo: async () => {
          await api.trashNote(id);
          await reload();
        },
      });
    } catch (err) {
      setError(errorMessage(err));
      await reload();
    }
  }

  function deleteNote(id: string) {
    setError(null);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    const timeoutId = setTimeout(async () => {
      pendingDeletes.current.delete(id);
      try {
        await api.deleteNote(id);
      } catch (err) {
        setError(errorMessage(err));
        await reload();
      }
    }, DELETE_UNDO_MS);
    pendingDeletes.current.set(id, timeoutId);

    notify('Note permanently deleted', {
      duration: DELETE_UNDO_MS,
      onUndo: () => {
        const pending = pendingDeletes.current.get(id);
        if (pending) {
          clearTimeout(pending);
          pendingDeletes.current.delete(id);
        }
        reload();
      },
    });
  }

  // "Empty trash" -- same undo-delay pattern as deleteNote above (a shared timeout referenced by
  // every id, rather than a blocking confirm dialog): notes disappear immediately, an undo toast
  // stands in for the confirmation, and the permanent delete only actually happens once that
  // window passes without being undone.
  function emptyTrash() {
    const ids = notes.map((n) => n.id);
    if (ids.length === 0) return;
    setError(null);
    setNotes([]);
    const timeoutId = setTimeout(async () => {
      for (const id of ids) pendingDeletes.current.delete(id);
      try {
        await Promise.all(ids.map((id) => api.deleteNote(id)));
      } catch (err) {
        setError(errorMessage(err));
        await reload();
      }
    }, DELETE_UNDO_MS);
    for (const id of ids) pendingDeletes.current.set(id, timeoutId);

    notify(`${ids.length} note${ids.length === 1 ? '' : 's'} permanently deleted`, {
      duration: DELETE_UNDO_MS,
      onUndo: () => {
        let any = false;
        for (const id of ids) {
          if (pendingDeletes.current.delete(id)) any = true;
        }
        if (any) {
          clearTimeout(timeoutId);
          reload();
        }
      },
    });
  }

  return {
    notes,
    loading,
    error,
    justCreatedId,
    reload,
    createNote,
    discardDraftNote,
    updateNote,
    setNoteAttachments,
    reorderNotes,
    trashNote,
    restoreNote,
    deleteNote,
    emptyTrash,
  };
}
