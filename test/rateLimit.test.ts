import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('createRateLimit', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.useRealTimers());

  it('returns 429 once a client exceeds the ceiling, then recovers after the window', async () => {
    vi.useFakeTimers();
    const { createRateLimit } = await import('../server/middleware/rateLimit.js');
    const limit = createRateLimit({ windowMs: 1000, max: 2 });

    const run = () => {
      let status = 200;
      const res = {
        status(code: number) {
          status = code;
          return this;
        },
        json() {
          return this;
        },
      };
      let passed = false;
      limit({ ip: '1.2.3.4' } as never, res as never, () => {
        passed = true;
      });
      return { status, passed };
    };

    expect(run().passed).toBe(true);
    expect(run().passed).toBe(true);
    const blocked = run();
    expect(blocked.passed).toBe(false);
    expect(blocked.status).toBe(429);

    vi.advanceTimersByTime(1001);
    expect(run().passed).toBe(true);
  });
});
