import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';
import { api } from '../api/client';
import { useDateFormat } from '../hooks/useDateFormat';
import type { PublicUser } from '../types';

interface Props {
  user: PublicUser;
  onUserUpdate: (user: PublicUser) => void;
  onClose: () => void;
}

export function SettingsModal({ user, onUserUpdate, onClose }: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // See FlipModal for why this is needed: without it, selecting text and releasing the mouse
  // outside the modal closes it, since the click's target becomes the backdrop either way.
  const mouseDownOnBackdrop = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const { mode: dateMode, setMode: setDateMode } = useDateFormat();

  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);
    setProfileSaving(true);
    try {
      const { user: updated, error: err } = await api.updateProfile({ username, email });
      if (err || !updated) {
        setProfileError(err ?? 'Could not update your profile.');
        return;
      }
      onUserUpdate(updated);
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error: err } = await api.changePassword(currentPassword, newPassword);
      if (err) {
        setError(err);
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="note-modal-backdrop"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="note-modal-header">
          <h2 className="settings-title">Settings</h2>
          <button type="button" title="Close" className="note-modal-close" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <form className="settings-form" onSubmit={submitProfile}>
          <h3 className="settings-section-title">Profile</h3>
          <label className="settings-field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} required />
          </label>
          <label className="settings-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {profileError && <div className="composer-error">{profileError}</div>}
          {profileSuccess && <div className="settings-success">Profile updated.</div>}
          <button type="submit" className="settings-submit" disabled={profileSaving}>
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <div className="settings-form">
          <h3 className="settings-section-title">Date display</h3>
          <div className="settings-toggle-group">
            <button
              type="button"
              className={`settings-toggle ${dateMode === 'relative' ? 'active' : ''}`}
              onClick={() => setDateMode('relative')}
            >
              Relative (3 days ago)
            </button>
            <button
              type="button"
              className={`settings-toggle ${dateMode === 'absolute' ? 'active' : ''}`}
              onClick={() => setDateMode('absolute')}
            >
              Absolute (Aug 22, 2026)
            </button>
          </div>
        </div>

        <form className="settings-form" onSubmit={submitPassword}>
          <h3 className="settings-section-title">Change password</h3>
          <label className="settings-field">
            <span>Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="settings-field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="settings-field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error && <div className="composer-error">{error}</div>}
          {success && <div className="settings-success">Password updated.</div>}
          <button type="submit" className="settings-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
