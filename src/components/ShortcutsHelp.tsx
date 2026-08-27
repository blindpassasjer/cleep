import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

const SHORTCUTS: [keys: string[], label: string][] = [
  [['/'], 'Focus search'],
  [['s'], 'Focus search'],
  [['c'], 'New note'],
  [['l'], 'New checklist'],
  [['g', 'n'], 'Go to Notes'],
  [['g', 'a'], 'Go to Archive'],
  [['g', 't'], 'Go to Trash'],
  [['?'], 'Show this help'],
  [['Esc'], 'Clear search / close'],
];

interface Props {
  onClose: () => void;
}

export function ShortcutsHelp({ onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="shortcuts-help-backdrop" onClick={onClose}>
      <div className="shortcuts-help" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-help-header">
          <h3>Keyboard shortcuts</h3>
          <button type="button" className="shortcuts-help-close" onClick={onClose} aria-label="Close">
            <IconClose width={16} height={16} />
          </button>
        </div>
        <dl className="shortcuts-help-list">
          {SHORTCUTS.map(([keys, label], i) => (
            <div key={i} className="shortcuts-help-row">
              <dt>
                {keys.map((k, j) => (
                  <kbd key={j}>{k}</kbd>
                ))}
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
