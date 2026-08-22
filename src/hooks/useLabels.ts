import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Label } from '../types';

export function useLabels() {
  const [labels, setLabels] = useState<Label[]>([]);

  const reload = useCallback(async () => {
    const { labels: rows } = await api.listLabels();
    setLabels(rows);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createLabel(name: string): Promise<string | null> {
    const { label, error } = await api.createLabel(name);
    if (error) return error;
    if (label) setLabels((prev) => [...prev, label].sort((a, b) => a.name.localeCompare(b.name)));
    return null;
  }

  async function deleteLabel(id: string) {
    setLabels((prev) => prev.filter((l) => l.id !== id));
    await api.deleteLabel(id);
  }

  return { labels, createLabel, deleteLabel };
}
