import { useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconArrowUpRight, IconMoon, IconSun } from './Icons';
import { api } from '../api/client';
import { resetDemoData } from '../api/mockClient';
import { useDateFormat } from '../hooks/useDateFormat';
import type { PublicUser } from '../types';

interface Props {
  user: PublicUser;
  onUserUpdate: (user: PublicUser) => void;
  onClose: () => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenAdmin?: () => void;
}

export function SettingsPage({ user, onUserUpdate, onClose, onLogout, theme, onToggleTheme, onOpenAdmin }: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button type="button" className="settings-back" onClick={onClose}>
          <IconArrowLeft width={18} height={18} /> Back to notes
        </button>
        <h1 className="settings-title">Settings</h1>
      </div>

      <form className="settings-form settings-card" onSubmit={submitProfile}>
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

      <form className="settings-form settings-card" onSubmit={submitPassword}>
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

      {import.meta.env.VITE_DEMO === 'true' && (
        <div className="settings-form settings-card">
          <h3 className="settings-section-title">Demo</h3>
          <button
            type="button"
            className="settings-toggle"
            onClick={() => {
              if (confirm('Reset the demo back to its starting notes? This clears everything you changed in this browser.')) {
                resetDemoData();
              }
            }}
          >
            Reset demo data
          </button>
        </div>
      )}

      <div className="settings-form settings-card">
        <h3 className="settings-section-title">Account</h3>
        {onOpenAdmin && (
          <button type="button" className="settings-toggle" onClick={onOpenAdmin}>
            Manage users
          </button>
        )}
        <button type="button" className="settings-toggle settings-logout" onClick={onLogout}>
          Sign out
        </button>
      </div>

      <div className="settings-form settings-card">
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

      {/* Only shown on mobile -- on wider screens theme and Buy Me a Coffee already live in the
          topbar, so repeating them here would just be clutter. */}
      <div className="settings-form settings-card settings-section-mobile-only">
        <h3 className="settings-section-title">Appearance</h3>
        <div className="settings-toggle-group">
          <button type="button" className={`settings-toggle ${theme === 'light' ? 'active' : ''}`} onClick={() => theme === 'dark' && onToggleTheme()}>
            <IconSun width={16} height={16} /> Light
          </button>
          <button type="button" className={`settings-toggle ${theme === 'dark' ? 'active' : ''}`} onClick={() => theme === 'light' && onToggleTheme()}>
            <IconMoon width={16} height={16} /> Dark
          </button>
        </div>
      </div>

      <div className="settings-form settings-card settings-section-mobile-only">
        <h3 className="settings-section-title">Support</h3>
        <div className="settings-support-header">
          <img src={`${import.meta.env.BASE_URL}assets/developer.jpg`} alt="" className="coffee-popover-avatar" aria-hidden="true" />
          <p>Support keeps Cleep running</p>
        </div>
        <div className="coffee-popover-options">
          <a
            href="https://qr.vipps.no/box/26128ed0-008f-4b5a-bd8d-9a936f58cf83/pay-in"
            target="_blank"
            rel="noopener noreferrer"
            className="coffee-option coffee-option-accent"
          >
            <span>Vipps me</span>
            <IconArrowUpRight width={15} height={15} />
          </a>
          <a href="https://buymeacoffee.com/blindpassasjer" target="_blank" rel="noopener noreferrer" className="coffee-option">
            <span>Buy me a coffee</span>
            <IconArrowUpRight width={15} height={15} />
          </a>
        </div>
      </div>
    </div>
  );
}
