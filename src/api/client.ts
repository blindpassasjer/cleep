import type { Note, Label, PublicUser, View } from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'same-origin',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'Request failed.');
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: PublicUser | null; error: string | null }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<Record<string, never>>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: PublicUser | null }>('/auth/me'),

  listNotes: (view: View) => {
    const qs = view.kind === 'archive' ? '?view=archive' : view.kind === 'trash' ? '?view=trash' : view.kind === 'label' ? `?label=${encodeURIComponent(view.id)}` : '';
    return request<{ notes: Note[] }>(`/notes${qs}`);
  },
  createNote: (title: string, content: string, color: string) =>
    request<{ note: Note }>('/notes', { method: 'POST', body: JSON.stringify({ title, content, color }) }),
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived'>>) =>
    request<{ note: Note }>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  trashNote: (id: string) => request<{ note: Note }>(`/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id: string) => request<{ note: Note }>(`/notes/${id}/restore`, { method: 'POST' }),
  deleteNote: (id: string) => request<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),

  listLabels: () => request<{ labels: Label[] }>('/labels'),
  createLabel: (name: string) => request<{ label: Label | null; error: string | null }>('/labels', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteLabel: (id: string) => request<{ ok: true }>(`/labels/${id}`, { method: 'DELETE' }),
  attachLabel: (noteId: string, labelId: string) => request<{ ok: true }>(`/notes/${noteId}/labels/${labelId}`, { method: 'PUT' }),
  detachLabel: (noteId: string, labelId: string) => request<{ ok: true }>(`/notes/${noteId}/labels/${labelId}`, { method: 'DELETE' }),
};
