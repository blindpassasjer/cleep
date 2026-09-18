import { pgTable, text, timestamp, boolean, bigint, jsonb, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

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

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    emailLower: text('email_lower').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailLowerIdx: uniqueIndex('users_email_lower_idx').on(table.emailLower),
  }),
);

// Single-row table (id is always 'singleton') for instance-wide admin settings.
export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  registrationOpen: boolean('registration_open').notNull().default(false),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const notes = pgTable('notes', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  // `content`/`isChecklist`/`items` are legacy columns kept as a shadow-written copy of `blocks`
  // during the block-model migration (safe rollback target; see server/lib/blocks.ts). New code
  // should read/write `blocks` only.
  content: text('content').notNull().default(''),
  isChecklist: boolean('is_checklist').notNull().default(false),
  items: jsonb('items').$type<ChecklistItem[]>().notNull().default([]),
  blocks: jsonb('blocks').$type<NoteBlock[]>().notNull().default([]),
  color: text('color').notNull().default('default'),
  pinned: boolean('pinned').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  isRecording: boolean('is_recording').notNull().default(false),
  trashedAt: timestamp('trashed_at', { withTimezone: true }),
  position: bigint('position', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Note-level password lock (see server/lib/noteCrypto.ts). When `locked`, `blocks` is reset to
  // `[]` and the real content lives only in `encryptedBlocks` -- so a bulk read can never leak
  // plaintext for a locked note even by accident. `lockSalt`/`lockVerifier` let the server check a
  // password attempt without decrypting; `lockIv`/`lockAuthTag` are the AES-GCM parameters for
  // `encryptedBlocks`. All four are null exactly when `locked` is false. Nothing here stores the
  // derived key or the plaintext password -- forgetting a note's password permanently loses it.
  locked: boolean('locked').notNull().default(false),
  lockSalt: text('lock_salt'),
  lockVerifier: text('lock_verifier'),
  lockIv: text('lock_iv'),
  lockAuthTag: text('lock_auth_tag'),
  encryptedBlocks: text('encrypted_blocks'),
});

export const labels = pgTable(
  'labels',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('default'),
  },
  (table) => ({
    userNameIdx: uniqueIndex('labels_user_name_idx').on(table.userId, table.name),
  }),
);

export const noteLabels = pgTable(
  'note_labels',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.noteId, table.labelId] }),
  }),
);

// Global per-URL cache of link-preview metadata (OpenGraph title/image, favicon). Not scoped to a
// note or user -- the metadata is public and identical for everyone, so one row per URL is reused
// across every note that mentions it. `status` is 'ok' when a fetch produced usable metadata and
// 'error' otherwise; `fetchedAt` drives staleness (see server/routes/linkPreview.ts).
export const linkPreviews = pgTable('link_previews', {
  url: text('url').primaryKey(),
  title: text('title'),
  imageUrl: text('image_url'),
  siteName: text('site_name'),
  faviconUrl: text('favicon_url'),
  status: text('status').notNull().default('ok'), // 'ok' | 'error'
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  noteId: text('note_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'image' | 'video' | 'audio'
  originalName: text('original_name').notNull(),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  waveformPeaks: jsonb('waveform_peaks').$type<number[] | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Set together, only while the parent note is locked -- the file at `storageKey` is AES-GCM
  // ciphertext instead of the original bytes. Both null when the note isn't locked.
  encIv: text('enc_iv'),
  encAuthTag: text('enc_auth_tag'),
});
