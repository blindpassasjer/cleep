import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicUser } from '../types';

export function LoginPage({ onLogin }: { onLogin: (user: PublicUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    api
      .registrationStatus()
      .then(({ open }) => setRegistrationOpen(open))
      .catch(() => {});
  }, []);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user, error: err } =
        mode === 'login' ? await api.login(email, password, rememberMe) : await api.register(email, username, password);
      if (user) {
        onLogin(user);
      } else {
        setError(err ?? (mode === 'login' ? 'Invalid email or password.' : 'Could not create your account.'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Cleep</h1>
        <p className="login-subtitle">{mode === 'login' ? 'Sign in to your notes' : 'Create your account'}</p>
        {mode === 'register' && (
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} required autoFocus />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
        </label>
        {mode === 'login' && (
          <label className="login-remember">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Keep me logged in
          </label>
        )}
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        {registrationOpen && (
          <button
            type="button"
            className="login-mode-switch"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}
