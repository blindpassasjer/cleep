import type { AdminUser, Attachment, ChecklistItem, Label, Note, NoteColor, PublicUser, View } from '../types';
import { buildDemoNotes, DEMO_LABELS } from './demoSeed';

// Everything here runs client-side against localStorage, standing in for the real Express API
// (src/api/client.ts) when the app is built in demo mode (VITE_DEMO=true) for GitHub Pages, which
// can't host the Postgres-backed server. Shape must match `api` in client.ts exactly.

const STORAGE_KEY = 'cleep-demo-state-v1';
const DEMO_USER: PublicUser = { id: 'demo-user', email: 'demo@cleep.app', username: 'Demo', role: 'user' };

interface State {
  notes: Note[];
  labels: Label[];
  loggedIn: boolean;
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // ignore corrupt storage, fall through to a fresh seed
  }
  return { notes: buildDemoNotes(), labels: [...DEMO_LABELS], loggedIn: true };
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable -- demo keeps working in-memory for the rest of the session
  }
}

export function resetDemoData() {
  state = { notes: buildDemoNotes(), labels: [...DEMO_LABELS], loggedIn: true };
  save();
  location.reload();
}

// Attachments hold real Blob data, which doesn't belong in localStorage (quota, serialization) --
// kept in memory only, so they survive the session but not a page reload.
const attachmentBlobs = new Map<string, { blob: Blob; attachment: Attachment }>();
let attachmentSeq = 0;

function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function findNote(id: string): Note {
  const n = state.notes.find((note) => note.id === id);
  if (!n) throw new Error('Note not found.');
  return n;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.position !== b.position) return b.position - a.position;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export const mockApi = {
  login: () => {
    state.loggedIn = true;
    save();
    return delay({ user: DEMO_USER, error: null });
  },
  logout: () => {
    state.loggedIn = false;
    save();
    return delay({});
  },
  me: () => delay({ user: state.loggedIn ? DEMO_USER : null }),
  changePassword: () => delay({ error: 'Not available in the demo.' }),
  updateProfile: (patch: Partial<Pick<PublicUser, 'email' | 'username'>>) =>
    delay({ user: { ...DEMO_USER, ...patch }, error: null }),
  registrationStatus: () => delay({ open: false }),
  register: () => {
    state.loggedIn = true;
    save();
    return delay({ user: DEMO_USER, error: null });
  },

  adminListUsers: () => delay({ users: [{ ...DEMO_USER, createdAt: new Date().toISOString(), noteCount: state.notes.length }] as AdminUser[] }),
  adminCreateUser: () => delay({ user: null, error: 'Not available in the demo.' }),
  adminDeleteUser: () => delay({ ok: true as const }),
  adminUpdateUser: () => delay({ user: null, error: 'Not available in the demo.' }),
  adminResetUserPassword: () => delay({ ok: false, error: 'Not available in the demo.' }),
  adminGetSettings: () => delay({ registrationOpen: false }),
  adminSetRegistrationOpen: () => delay({ registrationOpen: false, error: 'Not available in the demo.' }),

  listNotes: (view: View, page?: { limit?: number; offset?: number }) => {
    let rows: Note[];
    if (view.kind === 'label') {
      const ids = view.ids;
      rows = state.notes.filter(
        (n) =>
          !n.trashedAt &&
          !n.archived &&
          (view.match === 'all' ? ids.every((id) => n.labelIds.includes(id)) : ids.some((id) => n.labelIds.includes(id))),
      );
    } else if (view.kind === 'trash') {
      rows = state.notes.filter((n) => n.trashedAt);
    } else if (view.kind === 'recordings') {
      rows = state.notes.filter((n) => !n.trashedAt && n.isRecording);
    } else {
      rows = state.notes.filter((n) => !n.trashedAt && !n.isRecording && n.archived === (view.kind === 'archive'));
    }
    rows = sortNotes(rows);
    const offset = page?.offset ?? 0;
    const sliced = page?.limit !== undefined ? rows.slice(offset, offset + page.limit) : offset > 0 ? rows.slice(offset) : rows;
    return delay({ notes: sliced });
  },
  createNote: (
    title: string,
    content: string,
    color: string,
    extra?: { isChecklist?: boolean; items?: ChecklistItem[]; isRecording?: boolean },
  ) => {
    const nowIso = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      userId: DEMO_USER.id,
      title,
      content,
      isChecklist: Boolean(extra?.isChecklist),
      items: extra?.items ?? [],
      color: color as NoteColor,
      pinned: false,
      archived: false,
      isRecording: Boolean(extra?.isRecording),
      trashedAt: null,
      position: Date.now(),
      createdAt: nowIso,
      updatedAt: nowIso,
      labelIds: [],
      attachments: [],
    };
    state.notes.push(note);
    save();
    return delay({ note });
  },
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'pinned' | 'archived' | 'isChecklist' | 'items' | 'position'>>,
  ) => {
    const note = findNote(id);
    Object.assign(note, patch, { updatedAt: new Date().toISOString() });
    save();
    return delay({ note });
  },
  trashNote: (id: string) => {
    const note = findNote(id);
    note.trashedAt = new Date().toISOString();
    save();
    return delay({ note });
  },
  restoreNote: (id: string) => {
    const note = findNote(id);
    note.trashedAt = null;
    save();
    return delay({ note });
  },
  deleteNote: (id: string) => {
    state.notes = state.notes.filter((n) => n.id !== id);
    for (const [attId, entry] of attachmentBlobs) {
      if (entry.attachment.noteId === id) {
        URL.revokeObjectURL(entry.attachment.url);
        attachmentBlobs.delete(attId);
      }
    }
    save();
    return delay({ ok: true as const });
  },

  listLabels: () => delay({ labels: [...state.labels].sort((a, b) => a.name.localeCompare(b.name)) }),
  createLabel: (name: string, color: NoteColor = 'default') => {
    if (state.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      return delay({ label: null, error: 'A label with that name already exists.' });
    }
    const label: Label = { id: crypto.randomUUID(), userId: DEMO_USER.id, name, color };
    state.labels.push(label);
    save();
    return delay({ label, error: null });
  },
  renameLabel: (id: string, name: string) => {
    const label = state.labels.find((l) => l.id === id);
    if (!label) return delay({ label: null, error: 'Label not found.' });
    label.name = name;
    save();
    return delay({ label, error: null });
  },
  deleteLabel: (id: string) => {
    state.labels = state.labels.filter((l) => l.id !== id);
    for (const note of state.notes) note.labelIds = note.labelIds.filter((l) => l !== id);
    save();
    return delay({ ok: true as const });
  },
  attachLabel: (noteId: string, labelId: string) => {
    const note = findNote(noteId);
    if (!note.labelIds.includes(labelId)) note.labelIds.push(labelId);
    save();
    return delay({ ok: true as const });
  },
  detachLabel: (noteId: string, labelId: string) => {
    const note = findNote(noteId);
    note.labelIds = note.labelIds.filter((l) => l !== labelId);
    save();
    return delay({ ok: true as const });
  },

  listAttachments: (noteId: string) =>
    delay({ attachments: [...attachmentBlobs.values()].map((v) => v.attachment).filter((a) => a.noteId === noteId) }),
  uploadAttachment: (noteId: string, file: File | Blob, filename?: string, waveformPeaks?: number[]) => {
    const id = `demo-attachment-${++attachmentSeq}`;
    const mimeType = file.type || 'application/octet-stream';
    const kind = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'audio';
    const attachment: Attachment = {
      id,
      noteId,
      kind,
      name: filename ?? (file instanceof File ? file.name : 'recording'),
      mimeType,
      sizeBytes: file.size,
      waveformPeaks: waveformPeaks ?? null,
      url: URL.createObjectURL(file),
      createdAt: new Date().toISOString(),
    };
    attachmentBlobs.set(id, { blob: file, attachment });
    return delay({ attachment });
  },
  deleteAttachment: (_noteId: string, attachmentId: string) => {
    const entry = attachmentBlobs.get(attachmentId);
    if (entry) {
      URL.revokeObjectURL(entry.attachment.url);
      attachmentBlobs.delete(attachmentId);
    }
    return delay({ ok: true as const });
  },

  exportUrl: () => '/api/export',
  importGoogleKeep: () =>
    delay({ imported: 0, skippedTrashed: 0, errors: ['Import is not available in the demo.'] }),
};
