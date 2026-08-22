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

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  trashedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  labelIds: string[];
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

export type View = 'notes' | 'archive' | 'trash';
