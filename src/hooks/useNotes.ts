import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Note, NoteColor, View } from '../types';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function useNotes(view: View) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      await api.createNote(title, content, color);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }

  async function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived'>>) {
    setError(null);
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      await api.updateNote(id, patch);
      if (patch.archived !== undefined) await reload();
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
    } catch (err) {
      setError(errorMessage(err));
      await reload();
    }
  }

  async function deleteNote(id: string) {
    setError(null);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.deleteNote(id);
    } catch (err) {
      setError(errorMessage(err));
      await reload();
    }
  }

  return { notes, loading, error, reload, createNote, updateNote, trashNote, restoreNote, deleteNote };
}
