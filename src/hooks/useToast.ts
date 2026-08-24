import { useCallback, useRef, useState } from 'react';

export interface ToastState {
  id: number;
  message: string;
  onUndo?: () => void;
  actionLabel?: string;
}

interface ShowOptions {
  onUndo?: () => void;
  onExpire?: () => void;
  duration?: number;
  actionLabel?: string;
}

export type NotifyFn = (message: string, options?: ShowOptions) => void;

const DEFAULT_DURATION = 5000;

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const show = useCallback((message: string, options: ShowOptions = {}) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const id = ++idRef.current;
    setToast({ id, message, onUndo: options.onUndo, actionLabel: options.actionLabel });
    timeoutRef.current = setTimeout(() => {
      setToast((current) => {
        if (current?.id !== id) return current;
        options.onExpire?.();
        return null;
      });
    }, options.duration ?? DEFAULT_DURATION);
  }, []);

  const dismiss = useCallback((runUndo: boolean) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast((current) => {
      if (runUndo) current?.onUndo?.();
      return null;
    });
  }, []);

  return { toast, show, dismiss };
}
