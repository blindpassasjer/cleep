import type { View } from '../types';

export function Sidebar({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="sidebar">
      <button className={view === 'notes' ? 'active' : ''} onClick={() => onChange('notes')}>
        💡 Notes
      </button>
      <button className={view === 'archive' ? 'active' : ''} onClick={() => onChange('archive')}>
        🗄️ Archive
      </button>
      <button className={view === 'trash' ? 'active' : ''} onClick={() => onChange('trash')}>
        🗑️ Trash
      </button>
    </nav>
  );
}
