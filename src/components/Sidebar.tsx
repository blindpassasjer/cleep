import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  onExpand: () => void;
  onCollapse: () => void;
}

export function Sidebar({ view, onChange, labels, onCreateLabel, onRenameLabel, onDeleteLabel, notify, open, onExpand, onCollapse }: Props) {
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

  const navRef = useRef<HTMLElement>(null);

  // .sidebar.open sizes itself with `width: max-content` (see index.css) so the drawer never
  // reaches out further than its content needs -- but `max-content` is a keyword, not a length,
  // and CSS transitions can't interpolate to/from one (same reason `width: auto` can't animate).
  // Left alone, opening/closing would just snap instead of sliding. So drive `width` from here
  // instead, always as a real px number: measure the natural (uncapped-by-us) target by briefly
  // clearing the inline override so the stylesheet's max-content/min/max rules resolve it, read
  // that, restore the previous value synchronously (nothing paints in between), then set the real
  // target on the next frame so the change is a normal, animatable px-to-px transition.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || !isMobile) return;
    if (!open) {
      nav.style.width = '64px';
      return;
    }
    const prevWidth = nav.style.width;

    // .sidebar-label-text has its own max-width/opacity transition for the reveal (see index.css)
    // that's still sitting at its pre-transition (collapsed) value right now -- the .open class
    // just landed in this same commit, so no frame has played yet to actually start animating it
    // toward its target. Measuring through it would read that collapsed value and undersize the
    // drawer. Force each label's transition off *and flush that as the committed style* (the
    // `void nav.offsetHeight` read) before touching anything else -- otherwise the transition-off
    // and the value change below would land in the same style recalc, and the transition can still
    // be judged against the pre-disable style rather than the one we just set. Restored once the
    // measurement is done so the next real open/close still animates normally.
    const texts = nav.querySelectorAll<HTMLElement>('.sidebar-label-text');
    texts.forEach((el) => el.style.setProperty('transition', 'none', 'important'));
    void nav.offsetHeight;

    nav.style.width = '';
    const natural = nav.getBoundingClientRect().width;
    nav.style.width = prevWidth;

    texts.forEach((el) => el.style.removeProperty('transition'));

    const frame = requestAnimationFrame(() => {
      nav.style.width = `${natural}px`;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, isMobile, labels, editingId]);

  useEffect(() => {
    if (isMobile) return;
    const nav = navRef.current;
    if (nav) nav.style.width = '';
  }, [isMobile]);

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
    <nav
      ref={navRef}
      className={`sidebar ${open ? 'open' : ''}`}
      onClick={(e) => {
        // Only the bare nav background, not a bubbled click from one of its buttons/rows -- e.g.
        // the empty space below the icon rail on mobile, which otherwise had no way to toggle the
        // drawer short of hitting the topbar's hamburger. Mirrors that hamburger: collapsed ->
        // expand, open -> collapse.
        if (e.target === e.currentTarget) {
          if (open) onCollapse();
          else onExpand();
        }
      }}
    >
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
      {/* A shared grid, not each row sizing independently -- so the rename/delete column lines up
          at the same x across every row (as wide as the single longest label name needs), rather
          than each row's buttons trailing right after that row's own, differently-sized name. */}
      <div className="sidebar-labels-list">
        {labels.map((label) => (
          // The row itself always renders, editing or not -- keeping it in the DOM means its
          // (fixed, name-driven) size keeps feeding the shared grid's column widths the same way
          // regardless of edit state. The rename form is layered on top via position: absolute
          // (see .sidebar-edit-label) instead of replacing the row as a sibling grid item, which is
          // what previously let its own, differently-sized content (an input with room to type)
          // widen the *whole* grid -- and so the sidebar -- while any row was being renamed.
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
            {editingId === label.id && (
              <form className="sidebar-edit-label" onSubmit={(e) => submitEdit(e, label)}>
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
            )}
          </div>
        ))}
      </div>
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
