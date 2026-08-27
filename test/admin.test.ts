import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, createUserAndLogin, getUser } from './helpers.js';

describe('admin user management', () => {
  it('blocks non-admins from every admin route', async () => {
    const { user, agent } = await createUserAndLogin({ role: 'user' });
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await agent.post(`/api/admin/users/${user.id}/password`).send({})).status).toBe(403);
  });

  it('lets an admin reset a user password, returning a working temp password and revoking sessions', async () => {
    const admin = await createUserAndLogin({ role: 'admin' });
    const target = await createUserAndLogin({ role: 'user' });

    const res = await admin.agent.post(`/api/admin/users/${target.user.id}/password`).send({});
    expect(res.status).toBe(200);
    expect(res.body.tempPassword).toBeTruthy();

    // Old session is dead.
    expect((await target.agent.get('/api/auth/me')).body.user).toBeNull();

    // New temp password works.
    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: target.user.email, password: res.body.tempPassword });
    expect(relogin.status).toBe(200);
    expect(relogin.body.user).toBeTruthy();
  });

  it('rejects a duplicate email on user edit with 409', async () => {
    const admin = await createUserAndLogin({ role: 'admin' });
    const a = await createUserAndLogin({ role: 'user' });
    const b = await createUserAndLogin({ role: 'user' });

    const res = await admin.agent.patch(`/api/admin/users/${b.user.id}`).send({ email: a.user.email });
    expect(res.status).toBe(409);

    const ok = await admin.agent.patch(`/api/admin/users/${b.user.id}`).send({ username: 'renamed' });
    expect(ok.status).toBe(200);
    expect((await getUser(b.user.id)).username).toBe('renamed');
  });
});
