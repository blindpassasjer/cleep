import { useState } from 'react';
import { IconArchive, IconClose, IconNotes, IconPlus, IconTag, IconTrash } from './Icons';
import type { Label, View } from '../types';

interface Props {
  view: View;
  onChange: (view: View) => void;
  labels: Label[];
  onCreateLabel: (name: string) => Promise<string | null>;
  onDeleteLabel: (id: string) => void;
  open: boolean;
}

export function Sidebar({ view, onChange, labels, onCreateLabel, onDeleteLabel, open }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submitLabel(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const err = await onCreateLabel(trimmed);
    if (err) {
      setError(err);
      return;
    }
    setName('');
    setAdding(false);
    setError(null);
  }

  return (
    <nav className={`sidebar ${open ? 'open' : ''}`}>
      <button className={view.kind === 'notes' ? 'active' : ''} onClick={() => onChange({ kind: 'notes' })}>
        <IconNotes /> <span className="sidebar-label-text">Notes</span>
      </button>
      <button className={view.kind === 'archive' ? 'active' : ''} onClick={() => onChange({ kind: 'archive' })}>
        <IconArchive /> <span className="sidebar-label-text">Archive</span>
      </button>
      <button className={view.kind === 'trash' ? 'active' : ''} onClick={() => onChange({ kind: 'trash' })}>
        <IconTrash /> <span className="sidebar-label-text">Trash</span>
      </button>

      <div className="sidebar-section-label">Collections</div>
      {labels.map((label) => (
        <div key={label.id} className={`sidebar-label-row ${view.kind === 'label' && view.id === label.id ? 'active' : ''}`}>
          <button className="sidebar-label-name" onClick={() => onChange({ kind: 'label', id: label.id, name: label.name })}>
            <IconTag /> <span className="sidebar-label-text">{label.name}</span>
          </button>
          <button
            className="sidebar-label-delete"
            title="Delete collection"
            onClick={() => {
              if (view.kind === 'label' && view.id === label.id) onChange({ kind: 'notes' });
              onDeleteLabel(label.id);
            }}
          >
            <IconClose width={14} height={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <form className="sidebar-add-label" onSubmit={submitLabel}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!name.trim()) setAdding(false);
            }}
            placeholder="Collection name"
          />
        </form>
      ) : (
        <button className="sidebar-add-label-btn" onClick={() => setAdding(true)}>
          <IconPlus width={14} height={14} /> <span className="sidebar-label-text">New collection</span>
        </button>
      )}
      {error && <div className="sidebar-label-error">{error}</div>}
    </nav>
  );
}
