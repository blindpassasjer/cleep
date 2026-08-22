import type { users } from '../db/schema.js';

type UserRow = typeof users.$inferSelect;

export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
