export type NoteColor =
  | 'default'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'gray';

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export type AttachmentKind = 'image' | 'video' | 'audio';

export interface Attachment {
  id: string;
  noteId: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  waveformPeaks: number[] | null;
  url: string;
  createdAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  isChecklist: boolean;
  items: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  trashedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
  attachments: Attachment[];
}

export interface Label {
  id: string;
  userId: string;
  name: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export type View = { kind: 'notes' } | { kind: 'archive' } | { kind: 'trash' } | { kind: 'label'; id: string; name: string };
