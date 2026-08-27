import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, createUser, createUserAndLogin, login, setRegistrationOpen } from './helpers.js';

describe('auth', () => {
  it('rejects login with a wrong password', async () => {
    const user = await createUser({ password: 'correct-horse' });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong' });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.error).toBeTruthy();
  });

  it('logs in and returns the current user from /me', async () => {
    const { user, agent } = await createUserAndLogin();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('blocks registration unless the instance has it open', async () => {
    await setRegistrationOpen(false);
    const closed = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', username: 'newbie', password: 'password123' });
    expect(closed.body.user).toBeNull();

    await setRegistrationOpen(true);
    const open = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', username: 'newbie', password: 'password123' });
    expect(open.status).toBe(201);
    expect(open.body.user).toMatchObject({ email: 'new@example.com' });
  });

  it('change-password rejects a wrong current password and revokes other sessions', async () => {
    const user = await createUser({ password: 'original-pw' });
    const agentA = await login(user);
    const agentB = await login(user);

    const wrong = await agentA.post('/api/auth/password').send({ currentPassword: 'nope', newPassword: 'brand-new-pw' });
    expect(wrong.body.error).toBeTruthy();

    const ok = await agentA.post('/api/auth/password').send({ currentPassword: 'original-pw', newPassword: 'brand-new-pw' });
    expect(ok.body.error).toBeFalsy();

    // The session that changed the password still works...
    expect((await agentA.get('/api/auth/me')).body.user).toBeTruthy();
    // ...every other session is signed out.
    expect((await agentB.get('/api/auth/me')).body.user).toBeNull();
  });
});
