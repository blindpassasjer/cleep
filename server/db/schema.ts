import { pgTable, text, timestamp, boolean, bigint, jsonb, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

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
  content: text('content').notNull().default(''),
  isChecklist: boolean('is_checklist').notNull().default(false),
  items: jsonb('items').$type<ChecklistItem[]>().notNull().default([]),
  color: text('color').notNull().default('default'),
  pinned: boolean('pinned').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  isRecording: boolean('is_recording').notNull().default(false),
  trashedAt: timestamp('trashed_at', { withTimezone: true }),
  position: bigint('position', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const labels = pgTable(
  'labels',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
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
});
