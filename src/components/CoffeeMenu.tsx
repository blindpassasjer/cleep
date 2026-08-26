import { useEffect, useRef, useState } from 'react';
import { IconArrowUpRight, IconCoffee } from './Icons';

export function CoffeeMenu() {
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
    <div className="coffee-menu" ref={ref}>
      <button
        type="button"
        title="Buy me a coffee"
        aria-label="Buy me a coffee"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`icon-only ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCoffee width={18} height={18} />
      </button>

      {open && (
        <div className="coffee-popover" role="dialog" aria-label="Buy me a coffee">
          <div className="coffee-popover-header">
            <img src={`${import.meta.env.BASE_URL}assets/developer.jpg`} alt="" className="coffee-popover-avatar" aria-hidden="true" />
            <div>
              <h2>Buy me a coffee</h2>
              <p>Support keeps Cleep running</p>
            </div>
          </div>
          <div className="coffee-popover-options">
            <a
              href="https://qr.vipps.no/box/26128ed0-008f-4b5a-bd8d-9a936f58cf83/pay-in"
              target="_blank"
              rel="noopener noreferrer"
              className="coffee-option coffee-option-accent"
            >
              <span>Vipps me</span>
              <IconArrowUpRight width={15} height={15} />
            </a>
            <a
              href="https://buymeacoffee.com/blindpassasjer"
              target="_blank"
              rel="noopener noreferrer"
              className="coffee-option"
            >
              <span>Buy me a coffee</span>
              <IconArrowUpRight width={15} height={15} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
