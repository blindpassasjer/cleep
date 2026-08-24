import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Label } from '../types';

export function useLabels(enabled: boolean) {
  const [labels, setLabels] = useState<Label[]>([]);

  // See useNotes for why `enabled` has to be a dependency here -- without it, this hook's fetch
  // fires once on mount (before login resolves) and never again, since it has nothing else in its
  // dependency array to prompt a retry once a session actually exists.
  const reload = useCallback(async () => {
    if (!enabled) return;
    const { labels: rows } = await api.listLabels();
    setLabels(rows);
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createLabel(name: string): Promise<string | null> {
    const { label, error } = await api.createLabel(name);
    if (error) return error;
    if (label) setLabels((prev) => [...prev, label].sort((a, b) => a.name.localeCompare(b.name)));
    return null;
  }

  async function renameLabel(id: string, name: string): Promise<string | null> {
    const { label, error } = await api.renameLabel(id, name);
    if (error) return error;
    if (label) setLabels((prev) => prev.map((l) => (l.id === id ? label : l)).sort((a, b) => a.name.localeCompare(b.name)));
    return null;
  }

  async function deleteLabel(id: string) {
    setLabels((prev) => prev.filter((l) => l.id !== id));
    await api.deleteLabel(id);
  }

  return { labels, createLabel, renameLabel, deleteLabel };
}
