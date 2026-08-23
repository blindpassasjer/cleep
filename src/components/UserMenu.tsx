import { useEffect, useRef, useState } from 'react';

interface Props {
  username: string;
  onLogout: () => void;
}

export function UserMenu({ username, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-account-menu" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`user-account-trigger ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {username}
      </button>

      {open && (
        <div className="user-account-popover" role="dialog" aria-label="Account">
          <button
            type="button"
            className="user-account-logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
