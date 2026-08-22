import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Note, NoteColor, View } from '../types';

export function useNotes(view: View) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function createNote(title: string, content: string, color: NoteColor) {
    await api.createNote(title, content, color);
    await reload();
  }

  async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived'>>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    await api.updateNote(id, patch);
    if (patch.archived !== undefined) await reload();
  }

  async function trashNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await api.trashNote(id);
  }

  async function restoreNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await api.restoreNote(id);
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await api.deleteNote(id);
  }

  return { notes, loading, reload, createNote, updateNote, trashNote, restoreNote, deleteNote };
}
