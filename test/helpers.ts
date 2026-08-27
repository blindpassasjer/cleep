import './env.js';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { eq } from 'drizzle-orm';

type TestAgent = ReturnType<typeof request.agent>;
import { createApp } from '../server/app.js';
import { db } from '../server/db/client.js';
import { users, appSettings } from '../server/db/schema.js';

export const app = createApp();

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  role: 'user' | 'admin';
}

let seq = 0;

export async function createUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  seq += 1;
  const password = overrides.password ?? 'password123';
  const email = overrides.email ?? `user${seq}-${Date.now()}@example.com`;
  const user: TestUser = {
    id: overrides.id ?? crypto.randomUUID(),
    email,
    username: overrides.username ?? `user${seq}`,
    password,
    role: overrides.role ?? 'user',
  };
  await db.insert(users).values({
    id: user.id,
    email: user.email,
    emailLower: user.email.toLowerCase(),
    username: user.username,
    passwordHash: await bcrypt.hash(password, 4),
    role: user.role,
  });
  return user;
}

/** Returns a supertest agent that carries the signed session cookie for `user`. */
export async function login(user: TestUser): Promise<TestAgent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function createUserAndLogin(overrides: Partial<TestUser> = {}): Promise<{ user: TestUser; agent: TestAgent }> {
  const user = await createUser(overrides);
  const agent = await login(user);
  return { user, agent };
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: 'singleton', registrationOpen: open })
    .onConflictDoUpdate({ target: appSettings.id, set: { registrationOpen: open } });
}

export async function getUser(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}
