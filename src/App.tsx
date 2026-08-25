import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useNotes } from './hooks/useNotes';
import { useLabels } from './hooks/useLabels';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { api } from './api/client';
import { withGridViewTransition } from './lib/viewTransition';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NoteComposer, type NoteComposerHandle } from './components/NoteComposer';
import { QuickRecorder } from './components/QuickRecorder';
import { NotesGrid } from './components/NotesGrid';
import { BulkActionsBar } from './components/BulkActionsBar';
import { Toast } from './components/Toast';
import { SettingsPage } from './components/SettingsPage';
import { AdminPage } from './components/AdminPage';
import type { NoteColor, View } from './types';

export default function App() {
  const { user, setUser, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: 'notes' });
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<NoteComposerHandle>(null);
  const [pendingComposerOpen, setPendingComposerOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { toast, show, dismiss } = useToast();

  // Global keyboard shortcuts: "/" focuses search, "c"/"n" starts a new note. Ignored while typing
  // in any field (except "/", which should work even from another input to jump to search) or
  // while a modal/dialog is open, since those already own Escape/typing themselves.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === '/') {
        if (target === searchInputRef.current) return;
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (isTyping) return;
      if (document.querySelector('.note-modal-backdrop, .image-lightbox-backdrop')) return;

      if (e.key === 'c' || e.key === 'n') {
        e.preventDefault();
        if (composerRef.current) {
          composerRef.current.open();
        } else {
          // Composer isn't mounted (e.g. we're viewing Settings, a label/archive/trash, or
          // bulk-select is active) -- leave Settings if that's why, switch to the notes view and
          // clear selection, then open it once it mounts.
          setSettingsOpen(false);
          setView({ kind: 'notes' });
          setSelectedIds(new Set());
          setPendingComposerOpen(true);
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (pendingComposerOpen && composerRef.current) {
      composerRef.current.open();
      setPendingComposerOpen(false);
    }
  }, [pendingComposerOpen, view, selectedIds]);

  // Exposes the topbar's real rendered height as a CSS variable so the mobile sidebar drawer --
  // which needs to visually extend under the topbar while keeping its icons aligned with the
  // collapsed rail's -- doesn't have to hardcode a guessed pixel value that'd drift out of sync.
  // Depends on [loading, user] (not []) because the topbar itself doesn't exist yet on the very
  // first mount -- that render shows the loading screen or the login page instead -- so the effect
  // has to re-run once the real app tree (and its .topbar) actually appears, on every login.
  useEffect(() => {
    const topbar = appRef.current?.querySelector<HTMLElement>('.topbar');
    if (!topbar) return;
    const setHeight = () => {
      appRef.current?.style.setProperty('--topbar-height', `${topbar.getBoundingClientRect().height}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(topbar);
    return () => observer.disconnect();
  }, [loading, user]);
  const {
    notes,
    error,
    justCreatedId,
    reload,
    createNote,
    discardDraftNote,
    updateNote,
    setNoteAttachments,
    reorderNotes,
    trashNote,
    restoreNote,
    deleteNote,
    emptyTrash,
  } = useNotes(view, show, !!user);
  const { labels, createLabel, renameLabel, deleteLabel } = useLabels(!!user);

  useEffect(() => {
    setSelectedIds(new Set());
    setSidebarOpen(false);
  }, [view]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, search]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkArchive() {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) => api.updateNote(id, { archived: true })));
    await reload();
    show(`${ids.length} note${ids.length === 1 ? '' : 's'} archived`, {
      onUndo: async () => {
        await Promise.all(ids.map((id) => api.updateNote(id, { archived: false })));
        await reload();
      },
    });
  }

  async function bulkTrash() {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) => api.trashNote(id)));
    await reload();
    show(`${ids.length} note${ids.length === 1 ? '' : 's'} moved to trash`, {
      onUndo: async () => {
        await Promise.all(ids.map((id) => api.restoreNote(id)));
        await reload();
      },
    });
  }

  async function bulkColor(color: NoteColor) {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) => api.updateNote(id, { color })));
    await reload();
  }

  async function bulkLabel(labelId: string) {
    const ids = [...selectedIds];
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) => api.attachLabel(id, labelId)));
    await reload();
  }

  async function restoreAllTrash() {
    const ids = notes.map((n) => n.id);
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => api.restoreNote(id)));
    await reload();
    show(`${ids.length} note${ids.length === 1 ? '' : 's'} restored`);
  }

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="app" ref={appRef}>
      <TopBar
        ref={searchInputRef}
        user={user}
        search={search}
        onSearchChange={setSearch}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSettings={() => {
          setAdminOpen(false);
          setSettingsOpen(true);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      {import.meta.env.VITE_DEMO === 'true' && (
        <div className="demo-banner">
          You're viewing a live demo — notes are saved only in this browser, nothing reaches a server. Want the real thing?{' '}
          <a href="https://github.com/blindpassasjer/cleep" target="_blank" rel="noopener noreferrer">
            Self-host Cleep
          </a>
          .
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
      <div className="app-body">
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        <Sidebar
          view={view}
          onChange={(v) => {
            setSettingsOpen(false);
            setAdminOpen(false);
            withGridViewTransition(appRef.current?.querySelector('.notes-grid-root') ?? null, () => setView(v));
          }}
          labels={labels}
          onCreateLabel={createLabel}
          onRenameLabel={renameLabel}
          onDeleteLabel={deleteLabel}
          notify={show}
          open={sidebarOpen}
          onExpand={() => setSidebarOpen(true)}
        />
        <main className="main">
          {adminOpen ? (
            <AdminPage currentUser={user} onClose={() => setAdminOpen(false)} />
          ) : settingsOpen ? (
            <SettingsPage
              user={user}
              onUserUpdate={setUser}
              onClose={() => setSettingsOpen(false)}
              onLogout={logout}
              theme={theme}
              onToggleTheme={toggleTheme}
              onOpenAdmin={
                user.role === 'admin'
                  ? () => {
                      setSettingsOpen(false);
                      setAdminOpen(true);
                    }
                  : undefined
              }
            />
          ) : (
            <>
              {selectedIds.size > 0 ? (
                <BulkActionsBar
                  count={selectedIds.size}
                  labels={labels}
                  onClear={() => setSelectedIds(new Set())}
                  onArchive={bulkArchive}
                  onTrash={bulkTrash}
                  onColor={bulkColor}
                  onLabel={bulkLabel}
                />
              ) : view.kind === 'notes' ? (
                <NoteComposer ref={composerRef} onCreate={createNote} onUpdateDraft={updateNote} onDiscardDraft={discardDraftNote} />
              ) : view.kind === 'recordings' ? (
                <QuickRecorder onCreate={createNote} onReload={reload} />
              ) : (
                view.kind === 'trash' &&
                notes.length > 0 && (
                  <div className="trash-actions">
                    <button
                      type="button"
                      onClick={() =>
                        show(`Restore ${notes.length} note${notes.length === 1 ? '' : 's'}?`, {
                          actionLabel: 'Restore',
                          onUndo: restoreAllTrash,
                        })
                      }
                    >
                      Restore all
                    </button>
                    <button
                      type="button"
                      className="trash-actions-danger"
                      onClick={() =>
                        show(`Permanently delete ${notes.length} note${notes.length === 1 ? '' : 's'}?`, {
                          actionLabel: 'Empty trash',
                          onUndo: emptyTrash,
                        })
                      }
                    >
                      Empty trash
                    </button>
                  </div>
                )
              )}
              <NotesGrid
                notes={filtered}
                view={view}
                labels={labels}
                justCreatedId={justCreatedId}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onUpdate={updateNote}
                onAttachmentsChange={setNoteAttachments}
                onTrash={trashNote}
                onRestore={restoreNote}
                onDelete={deleteNote}
                reorderable={view.kind === 'notes' && search.trim() === ''}
                onReorder={reorderNotes}
              />
              {filtered.length === 0 && <div className="empty-state">Nothing here yet.</div>}
            </>
          )}
        </main>
      </div>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
