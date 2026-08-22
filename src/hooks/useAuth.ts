import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PublicUser } from '../types';

export function useAuth() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setUser(user))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return { user, setUser, loading, logout };
}
