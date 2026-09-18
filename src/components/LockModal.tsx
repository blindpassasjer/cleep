import { useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

export type LockModalMode = 'set' | 'enter' | 'remove';

interface Props {
  mode: LockModalMode;
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
}

const COPY: Record<LockModalMode, { title: string; submitLabel: string; placeholder: string }> = {
  set: { title: 'Lock this note', submitLabel: 'Lock', placeholder: 'New password' },
  enter: { title: 'Enter password', submitLabel: 'Unlock', placeholder: 'Password' },
  remove: { title: 'Remove lock', submitLabel: 'Remove lock', placeholder: 'Password' },
};

/** Password prompt for the three note-lock actions. Setting a password shows a confirm field and
 *  a plain-language warning that there's no recovery -- the server never stores the password or
 *  the derived key, so a forgotten password permanently loses that note's content. */
export function LockModal({ mode, onSubmit, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[mode];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'set' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return createPortal(
    <div className="lock-modal-backdrop" onClick={onClose}>
      <form className="lock-modal" role="dialog" aria-label={copy.title} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="lock-modal-header">
          <h3>{copy.title}</h3>
          <button type="button" className="lock-modal-close" onClick={onClose} aria-label="Close">
            <IconClose width={16} height={16} />
          </button>
        </div>
        {mode === 'set' && (
          <p className="lock-modal-warning">
            If you forget this password, this note&rsquo;s content can never be recovered — there is no reset.
          </p>
        )}
        <input
          type="password"
          autoFocus
          placeholder={copy.placeholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === 'set' && (
          <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
        {error && <div className="lock-modal-error">{error}</div>}
        <div className="lock-modal-actions">
          <button type="button" className="text-action" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="lock-modal-submit" disabled={busy || !password}>
            {busy ? 'Please wait…' : copy.submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
