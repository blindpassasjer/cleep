import { useMemo, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useNotes } from './hooks/useNotes';
import { useLabels } from './hooks/useLabels';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NoteComposer } from './components/NoteComposer';
import { NoteCard } from './components/NoteCard';
import type { View } from './types';

export default function App() {
  const { user, setUser, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: 'notes' });
  const [search, setSearch] = useState('');
  const { notes, error, createNote, updateNote, trashNote, restoreNote, deleteNote } = useNotes(view);
  const { labels, createLabel, deleteLabel } = useLabels();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [notes, search]);

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
          {view.kind === 'notes' && <NoteComposer onCreate={createNote} />}
          <div className="notes-grid">
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                view={view}
                labels={labels}
                onUpdate={updateNote}
                onTrash={trashNote}
                onRestore={restoreNote}
                onDelete={deleteNote}
              />
            ))}
          </div>
          {filtered.length === 0 && <div className="empty-state">Nothing here yet.</div>}
        </main>
      </div>
    </div>
  );
}
