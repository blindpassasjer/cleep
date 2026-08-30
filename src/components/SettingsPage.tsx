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
  onDataImported?: () => void;
  onShowShortcuts?: () => void;
}

const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

export function SettingsPage({ user, onUserUpdate, onClose, onLogout, theme, onToggleTheme, onOpenAdmin, onDataImported, onShowShortcuts }: Props) {
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

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const result = await api.importGoogleKeep(file);
      const parts = [`Imported ${result.imported} note${result.imported === 1 ? '' : 's'}`];
      if (result.skippedTrashed) parts.push(`${result.skippedTrashed} trashed note${result.skippedTrashed === 1 ? '' : 's'} skipped`);
      if (result.errors.length) parts.push(`${result.errors.length} warning${result.errors.length === 1 ? '' : 's'}`);
      setImportMessage(parts.join(' · '));
      if (result.imported > 0) onDataImported?.();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

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

      {!IS_DEMO && (
        <div className="settings-form settings-card">
          <h3 className="settings-section-title">Your data</h3>
          <p className="settings-help-text">
            Download every note, label, and attachment as a <code>.zip</code>, or bring your notes over from Google Keep
            (export your data with Google Takeout, then upload the <code>.zip</code> here).
          </p>
          <div className="settings-toggle-group settings-toggle-group-row">
            <a className="settings-toggle settings-toggle-accent" href={api.exportUrl()}>
              Export all data
            </a>
            <button
              type="button"
              className="settings-toggle settings-toggle-accent"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import from Google Keep'}
            </button>
          </div>
          <input ref={importInputRef} type="file" accept=".zip,application/zip" hidden onChange={onImportFile} />
          {importMessage && <div className="settings-success">{importMessage}</div>}
          {importError && <div className="composer-error">{importError}</div>}
        </div>
      )}

      {onShowShortcuts && (
        <div className="settings-form settings-card">
          <h3 className="settings-section-title">Keyboard shortcuts</h3>
          <button type="button" className="settings-toggle settings-toggle-accent settings-toggle-inline" onClick={onShowShortcuts}>
            View shortcuts
          </button>
        </div>
      )}

      {IS_DEMO && (
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

      {onOpenAdmin && (
        <div className="settings-form settings-card">
          <h3 className="settings-section-title">Account</h3>
          <button type="button" className="settings-toggle settings-toggle-accent settings-toggle-inline" onClick={onOpenAdmin}>
            Manage users
          </button>
        </div>
      )}

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
        <div className="settings-toggle-group settings-toggle-group-row">
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
            href="https://qr.vipps.no/box/ed3eba16-02d1-4fdd-8912-700acdb1442e/pay-in"
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

      {/* Its own card at the very bottom, apart from everything else -- a session-ending action
          shouldn't sit next to a navigation one (Manage users) where a mis-tap is easy. */}
      <div className="settings-form settings-card settings-card-full">
        <button type="button" className="settings-toggle settings-logout" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
