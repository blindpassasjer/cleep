import { useEffect, useState } from 'react';
import { COLORS } from './ColorPicker';
import { IconArchive, IconClose, IconEdit, IconNotes, IconPlus, IconTagFilled, IconTrash } from './Icons';
import type { Label, NoteColor, View } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import type { NotifyFn } from '../hooks/useToast';

// 'default' (no color) isn't in the rotation -- auto-assigning it would defeat the point of
// auto-assigning a color at all.
const AUTO_COLORS = COLORS.filter((c) => c !== 'default');

interface Props {
  view: View;
  onChange: (view: View) => void;
  labels: Label[];
  onCreateLabel: (name: string, color?: NoteColor) => Promise<string | null>;
  onRenameLabel: (id: string, name: string) => Promise<string | null>;
  onDeleteLabel: (id: string) => void;
  notify: NotifyFn;
  open: boolean;
}

export function Sidebar({ view, onChange, labels, onCreateLabel, onRenameLabel, onDeleteLabel, notify, open }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  // On mobile the collapsed rail must show only the tag icon -- rename/delete only become
  // reachable once the drawer is open. Gated here in JS (not just CSS) so it can't accidentally
  // render on the narrow rail regardless of stylesheet cascade/caching.
  const showRowActions = !isMobile || open;

  // Rename/delete are only reachable with the drawer open (see showRowActions above) -- if the
  // drawer closes mid-rename, drop back to the plain row instead of leaving the rename form
  // (unreachable to cancel or submit by tap) stranded in the collapsed rail.
  useEffect(() => {
    if (!showRowActions) setEditingId(null);
  }, [showRowActions]);

  async function commitAdd() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    const err = await onCreateLabel(trimmed, AUTO_COLORS[labels.length % AUTO_COLORS.length]);
    if (err) {
      setError(err);
      return;
    }
    setName('');
    setAdding(false);
    setError(null);
  }

  async function submitLabel(e: React.FormEvent) {
    e.preventDefault();
    await commitAdd();
  }

  function startEdit(label: Label) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditError(null);
  }

  async function commitEdit(label: Label) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === label.name) {
      setEditingId(null);
      return;
    }
    const err = await onRenameLabel(label.id, trimmed);
    if (err) {
      setEditError(err);
      return;
    }
    setEditingId(null);
    setEditError(null);
  }

  async function submitEdit(e: React.FormEvent, label: Label) {
    e.preventDefault();
    await commitEdit(label);
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
      {labels.map((label) =>
        editingId === label.id ? (
          <form key={label.id} className="sidebar-edit-label" onSubmit={(e) => submitEdit(e, label)}>
            <IconTagFilled className={`label-icon label-icon-${label.color}`} aria-hidden="true" />
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingId(null);
              }}
              onBlur={() => commitEdit(label)}
            />
          </form>
        ) : (
          <div key={label.id} className={`sidebar-label-row ${view.kind === 'label' && view.id === label.id ? 'active' : ''}`}>
            <button
              className="sidebar-label-name"
              title={label.name}
              onClick={() => onChange({ kind: 'label', id: label.id, name: label.name })}
            >
              <IconTagFilled className={`label-icon label-icon-${label.color}`} aria-hidden="true" />
              <span className="sidebar-label-text">{label.name}</span>
            </button>
            {showRowActions && (
              <>
                <button className="sidebar-label-edit" title="Rename collection" onClick={() => startEdit(label)}>
                  <IconEdit width={14} height={14} />
                </button>
                <button
                  className="sidebar-label-delete"
                  title="Delete collection"
                  onClick={() => {
                    notify(`Delete "${label.name}"?`, {
                      actionLabel: 'Delete',
                      onUndo: () => {
                        if (view.kind === 'label' && view.id === label.id) onChange({ kind: 'notes' });
                        onDeleteLabel(label.id);
                      },
                    });
                  }}
                >
                  <IconClose width={14} height={14} />
                </button>
              </>
            )}
          </div>
        ),
      )}
      {editError && <div className="sidebar-label-error">{editError}</div>}

      {adding ? (
        <form
          className="sidebar-add-label"
          onSubmit={submitLabel}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            if (name.trim()) commitAdd();
            else setAdding(false);
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" />
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
