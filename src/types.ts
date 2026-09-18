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

export interface TextBlock {
  id: string;
  type: 'text';
  html: string;
}

export interface ChecklistBlock {
  id: string;
  type: 'checklist';
  items: ChecklistItem[];
}

export type NoteBlock = TextBlock | ChecklistBlock;

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
  /** @deprecated legacy shadow field kept for one release during the blocks migration; use `blocks`. */
  content: string;
  /** @deprecated legacy shadow field kept for one release during the blocks migration; use `blocks`. */
  isChecklist: boolean;
  /** @deprecated legacy shadow field kept for one release during the blocks migration; use `blocks`. */
  items: ChecklistItem[];
  blocks: NoteBlock[];
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  isRecording: boolean;
  /** True once the note has a password set. When locked, `blocks` and `attachments` come back
   *  empty from the API -- the real content only exists as ciphertext server-side until unlocked
   *  with the password (see api.unlockNote). */
  locked: boolean;
  trashedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
  attachments: Attachment[];
}

export interface LinkPreview {
  url: string;
  title: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
}

export interface Label {
  id: string;
  userId: string;
  name: string;
  color: NoteColor;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export interface AdminUser extends PublicUser {
  createdAt: string;
  noteCount: number;
}

export type View =
  | { kind: 'notes' }
  | { kind: 'recordings' }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'label'; ids: string[]; names: string[]; match: 'any' | 'all' };
