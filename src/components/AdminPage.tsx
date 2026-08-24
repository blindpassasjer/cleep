import { useEffect, useState } from 'react';
import { IconArrowLeft, IconTrash } from './Icons';
import { api } from '../api/client';
import type { AdminUser, PublicUser } from '../types';

interface Props {
  currentUser: PublicUser;
  onClose: () => void;
}

export function AdminPage({ currentUser, onClose }: Props) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [togglingRegistration, setTogglingRegistration] = useState(false);

  function reloadUsers() {
    api
      .adminListUsers()
      .then(({ users }) => setUsers(users))
      .catch((err) => setListError(err instanceof Error ? err.message : 'Could not load users.'));
  }

  useEffect(() => {
    reloadUsers();
    api
      .adminGetSettings()
      .then(({ registrationOpen }) => {
        setRegistrationOpen(registrationOpen);
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  async function toggleRegistration() {
    setTogglingRegistration(true);
    try {
      const { registrationOpen: updated, error } = await api.adminSetRegistrationOpen(!registrationOpen);
      if (!error) setRegistrationOpen(updated);
    } finally {
      setTogglingRegistration(false);
    }
  }

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const { user, error } = await api.adminCreateUser(email, username, password, role);
      if (!user) {
        setCreateError(error ?? 'Could not create the account.');
        return;
      }
      setEmail('');
      setUsername('');
      setPassword('');
      setRole('user');
      reloadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteUser(user: AdminUser) {
    if (!confirm(`Delete ${user.username}'s account and all of their notes? This can't be undone.`)) return;
    setDeleteError(null);
    try {
      await api.adminDeleteUser(user.id);
      reloadUsers();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this account.');
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button type="button" className="settings-back" onClick={onClose}>
          <IconArrowLeft width={18} height={18} /> Back to notes
        </button>
        <h1 className="settings-title">Manage users</h1>
      </div>

      <div className="settings-form">
        <h3 className="settings-section-title">Registration</h3>
        <button
          type="button"
          className={`settings-toggle ${registrationOpen ? 'active' : ''}`}
          onClick={toggleRegistration}
          disabled={!settingsLoaded || togglingRegistration}
        >
          {registrationOpen ? 'Open — anyone can create an account' : 'Closed — only admins can create accounts'}
        </button>
      </div>

      <form className="settings-form" onSubmit={submitCreate}>
        <h3 className="settings-section-title">Create a user</h3>
        <label className="settings-field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} required />
        </label>
        <label className="settings-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="settings-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
        </label>
        <div className="settings-toggle-group">
          <button type="button" className={`settings-toggle ${role === 'user' ? 'active' : ''}`} onClick={() => setRole('user')}>
            User
          </button>
          <button type="button" className={`settings-toggle ${role === 'admin' ? 'active' : ''}`} onClick={() => setRole('admin')}>
            Admin
          </button>
        </div>
        {createError && <div className="composer-error">{createError}</div>}
        <button type="submit" className="settings-submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create user'}
        </button>
      </form>

      <div className="settings-form">
        <h3 className="settings-section-title">All users</h3>
        {deleteError && <div className="composer-error">{deleteError}</div>}
        {listError && <div className="composer-error">{listError}</div>}
        {!users && !listError && <div className="admin-users-empty">Loading…</div>}
        {users && users.length === 0 && <div className="admin-users-empty">No users yet.</div>}
        {users?.map((u) => (
          <div key={u.id} className="admin-user-row">
            <div className="admin-user-info">
              <div className="admin-user-name">
                {u.username} {u.role === 'admin' && <span className="admin-user-badge">Admin</span>}
              </div>
              <div className="admin-user-meta">
                {u.email} · {u.noteCount} note{u.noteCount === 1 ? '' : 's'}
              </div>
            </div>
            {u.id !== currentUser.id && (
              <button type="button" className="admin-user-delete" title="Delete account" onClick={() => deleteUser(u)}>
                <IconTrash width={17} height={17} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
