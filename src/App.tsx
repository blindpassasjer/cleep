import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useNotes } from './hooks/useNotes';
import { useLabels } from './hooks/useLabels';
import { useToast } from './hooks/useToast';
import { api } from './api/client';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NoteComposer } from './components/NoteComposer';
import { NotesGrid } from './components/NotesGrid';
import { BulkActionsBar } from './components/BulkActionsBar';
import { Toast } from './components/Toast';
import type { NoteColor, View } from './types';

export default function App() {
  const { user, setUser, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: 'notes' });
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast, show, dismiss } = useToast();
  const { notes, error, reload, createNote, discardDraftNote, updateNote, reorderNotes, trashNote, restoreNote, deleteNote } = useNotes(
    view,
    show,
  );
  const { labels, createLabel, deleteLabel } = useLabels();

  useEffect(() => {
    setSelectedIds(new Set());
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

  if (loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="app">
      <TopBar user={user} search={search} onSearchChange={setSearch} onLogout={logout} />
      {error && <div className="error-banner">{error}</div>}
      <div className="app-body">
        <Sidebar view={view} onChange={setView} labels={labels} onCreateLabel={createLabel} onDeleteLabel={deleteLabel} />
        <main className="main">
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
          ) : (
            view.kind === 'notes' && (
              <NoteComposer onCreate={createNote} onUpdateDraft={updateNote} onDiscardDraft={discardDraftNote} />
            )
          )}
          <NotesGrid
            notes={filtered}
            view={view}
            labels={labels}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onUpdate={updateNote}
            onTrash={trashNote}
            onRestore={restoreNote}
            onDelete={deleteNote}
            reorderable={view.kind === 'notes' && search.trim() === ''}
            onReorder={reorderNotes}
          />
          {filtered.length === 0 && <div className="empty-state">Nothing here yet.</div>}
        </main>
      </div>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
