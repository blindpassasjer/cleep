import type { ToastState } from '../hooks/useToast';

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: (runUndo: boolean) => void }) {
  if (!toast) return null;

  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button type="button" onClick={() => onDismiss(true)}>
          Undo
        </button>
      )}
      <button type="button" className="toast-close" title="Dismiss" onClick={() => onDismiss(false)}>
        ×
      </button>
    </div>
  );
}
