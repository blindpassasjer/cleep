import { pgTable, text, timestamp, boolean, bigint, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

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
  color: text('color').notNull().default('default'),
  pinned: boolean('pinned').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
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
