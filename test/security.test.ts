import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

describe('security headers', () => {
  const original = process.env.COOKIE_SECURE;
  afterEach(() => {
    process.env.COOKIE_SECURE = original;
  });

  it('sets the baseline headers on every response', async () => {
    const res = await request(createApp()).get('/api/auth/registration-status');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['permissions-policy']).toContain('microphone=(self)');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('emits HSTS only when COOKIE_SECURE is enabled', async () => {
    process.env.COOKIE_SECURE = 'false';
    const insecure = await request(createApp()).get('/api/auth/registration-status');
    expect(insecure.headers['strict-transport-security']).toBeUndefined();

    process.env.COOKIE_SECURE = 'true';
    const secure = await request(createApp()).get('/api/auth/registration-status');
    expect(secure.headers['strict-transport-security']).toContain('max-age=');
  });
});
