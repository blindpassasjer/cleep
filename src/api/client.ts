import type { AdminUser, Attachment, ChecklistItem, Note, Label, PublicUser, View } from '../types';

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
  registrationStatus: () => request<{ open: boolean }>('/auth/registration-status'),
  register: (email: string, username: string, password: string) =>
    request<{ user: PublicUser | null; error: string | null }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),

  adminListUsers: () => request<{ users: AdminUser[] }>('/admin/users'),
  adminCreateUser: (email: string, username: string, password: string, role: 'user' | 'admin') =>
    request<{ user: AdminUser | null; error: string | null }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, username, password, role }),
    }),
  adminDeleteUser: (id: string) => request<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
  adminGetSettings: () => request<{ registrationOpen: boolean }>('/admin/settings'),
  adminSetRegistrationOpen: (registrationOpen: boolean) =>
    request<{ registrationOpen: boolean; error: string | null }>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationOpen }),
    }),

  listNotes: (view: View, page?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (view.kind === 'archive') params.set('view', 'archive');
    else if (view.kind === 'trash') params.set('view', 'trash');
    else if (view.kind === 'recordings') params.set('view', 'recordings');
    else if (view.kind === 'label') params.set('label', view.id);
    if (page?.limit !== undefined) params.set('limit', String(page.limit));
    if (page?.offset !== undefined) params.set('offset', String(page.offset));
    const qs = params.toString();
    return request<{ notes: Note[] }>(`/notes${qs ? `?${qs}` : ''}`);
  },
  createNote: (
    title: string,
    content: string,
    color: string,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[]; isRecording?: boolean },
  ) => request<{ note: Note }>('/notes', { method: 'POST', body: JSON.stringify({ title, content, color, ...extra }) }),
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived' | 'isChecklist' | 'items' | 'position'>>,
  ) => request<{ note: Note }>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  trashNote: (id: string) => request<{ note: Note }>(`/notes/${id}/trash`, { method: 'POST' }),
  restoreNote: (id: string) => request<{ note: Note }>(`/notes/${id}/restore`, { method: 'POST' }),
  deleteNote: (id: string, options?: { keepalive?: boolean }) =>
    request<{ ok: true }>(`/notes/${id}`, { method: 'DELETE', keepalive: options?.keepalive }),

  listLabels: () => request<{ labels: Label[] }>('/labels'),
  createLabel: (name: string) => request<{ label: Label | null; error: string | null }>('/labels', { method: 'POST', body: JSON.stringify({ name }) }),
  renameLabel: (id: string, name: string) =>
    request<{ label: Label | null; error: string | null }>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
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
