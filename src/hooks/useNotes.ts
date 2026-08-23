import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ChecklistItem, Note, NoteColor, View } from '../types';

const DELETE_UNDO_MS = 5000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

type NotifyFn = (message: string, options?: { onUndo?: () => void; onExpire?: () => void; duration?: number }) => void;

export function useNotes(view: View, notify: NotifyFn) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { notes: rows } = await api.listNotes(view);
      setNotes(rows);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createNote(
    title: string,
    content: string,
    color: NoteColor,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[] },
  ): Promise<Note> {
    setError(null);
    try {
      const { note } = await api.createNote(title, content, color, extra);
      // Explicit "this one just got created" signal for the entrance animation -- distinct from
      // every other reload() (view switches, search, undo, background sync), which shouldn't
      // replay the pop-in for the whole grid. Cleared once the grid's had a chance to notice.
      setJustCreatedId(note.id);
      setTimeout(() => setJustCreatedId((current) => (current === note.id ? null : current)), 1000);
      await reload();
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
        await reload();
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

  return {
    notes,
    loading,
    error,
    justCreatedId,
    reload,
    createNote,
    discardDraftNote,
    updateNote,
    reorderNotes,
    trashNote,
    restoreNote,
    deleteNote,
  };
}
