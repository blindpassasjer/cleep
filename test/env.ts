import os from 'node:os';
import path from 'node:path';

/**
 * Shared test configuration. Imported (for its side effects) at the very top of both the global
 * setup and the per-file setup so every server module sees a valid environment before it loads.
 */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? 'postgres://cleep:cleep@localhost:5433/cleep';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET ??= 'test-session-secret-000000000000000000000000';
process.env.ATTACHMENTS_DIR ??= path.join(os.tmpdir(), 'cleep-test-attachments');
process.env.COOKIE_SECURE = 'false';
// Keep the rate limiter out of the way unless a test opts into a low ceiling.
process.env.AUTH_RATE_LIMIT_MAX ??= '1000';
