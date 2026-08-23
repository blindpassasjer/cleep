import { useState } from 'react';
import type { DateDisplayMode } from '../lib/formatDate';

const STORAGE_KEY = 'cleep-date-format';

export function useDateFormat() {
  const [mode, setModeState] = useState<DateDisplayMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'absolute' ? 'absolute' : 'relative';
  });

  function setMode(next: DateDisplayMode) {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }

  return { mode, setMode };
}
