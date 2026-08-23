import type { Attachment, ChecklistItem, Note, Label, PublicUser, View } from '../types';

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

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'POST', body: formData, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'Upload failed.');
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string, rememberMe: boolean) =>
    request<{ user: PublicUser | null; error: string | null }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    }),
  logout: () => request<Record<string, never>>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: PublicUser | null }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ error: string | null }>('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  updateProfile: (patch: Partial<Pick<PublicUser, 'email' | 'username'>>) =>
    request<{ user: PublicUser | null; error: string | null }>('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  listNotes: (view: View) => {
    const qs = view.kind === 'archive' ? '?view=archive' : view.kind === 'trash' ? '?view=trash' : view.kind === 'label' ? `?label=${encodeURIComponent(view.id)}` : '';
    return request<{ notes: Note[] }>(`/notes${qs}`);
  },
  createNote: (title: string, content: string, color: string, extra?: { isChecklist?: boolean; items?: ChecklistItem[] }) =>
    request<{ note: Note }>('/notes', { method: 'POST', body: JSON.stringify({ title, content, color, ...extra }) }),
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived' | 'isChecklist' | 'items' | 'position'>>,
  ) => request<{ note: Note }>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  trashNote: (id: string) => request<{ note: Note }>(`/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id: string) => request<{ note: Note }>(`/notes/${id}/restore`, { method: 'POST' }),
  deleteNote: (id: string) => request<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),

  listLabels: () => request<{ labels: Label[] }>('/labels'),
  createLabel: (name: string) => request<{ label: Label | null; error: string | null }>('/labels', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteLabel: (id: string) => request<{ ok: true }>(`/labels/${id}`, { method: 'DELETE' }),
  attachLabel: (noteId: string, labelId: string) => request<{ ok: true }>(`/notes/${noteId}/labels/${labelId}`, { method: 'PUT' }),
  detachLabel: (noteId: string, labelId: string) => request<{ ok: true }>(`/notes/${noteId}/labels/${labelId}`, { method: 'DELETE' }),

  listAttachments: (noteId: string) => request<{ attachments: Attachment[] }>(`/notes/${noteId}/attachments`),
  uploadAttachment: (noteId: string, file: File | Blob, filename?: string, waveformPeaks?: number[]) => {
    const formData = new FormData();
    formData.append('file', file, filename);
    if (waveformPeaks) formData.append('waveformPeaks', JSON.stringify(waveformPeaks));
    return upload<{ attachment: Attachment }>(`/notes/${noteId}/attachments`, formData);
  },
  deleteAttachment: (noteId: string, attachmentId: string) =>
    request<{ ok: true }>(`/notes/${noteId}/attachments/${attachmentId}`, { method: 'DELETE' }),
};
