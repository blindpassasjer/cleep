import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { attachSession } from './middleware/session.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { notesRouter } from './routes/notes.js';
import { labelsRouter } from './routes/labels.js';
import { noteAttachmentsRouter } from './routes/noteAttachments.js';
import { attachmentFilesRouter } from './routes/attachmentFiles.js';
import { dataTransferRouter } from './routes/dataTransfer.js';

/**
 * Fails fast if a required environment variable is missing. Called from the server entrypoint
 * (index.ts) but skipped by the test harness, which supplies its own config.
 */
export function assertRequiredEnv(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required.');
  }
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required.');
  }
  if (!process.env.ATTACHMENTS_DIR) {
    throw new Error('ATTACHMENTS_DIR environment variable is required.');
  }
  if (Boolean(process.env.ADMIN_EMAIL) !== Boolean(process.env.ADMIN_PASSWORD)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must both be set, or both left unset.');
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') {
    // Only enable when a reverse proxy sits in front (see TRUST_PROXY in .env.example) -- otherwise
    // a client could spoof X-Forwarded-For to forge req.ip and dodge the auth rate limiter.
    app.set('trust proxy', 1);
  }

  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(process.env.SESSION_SECRET));
  app.use(attachSession);

  app.use('/api/auth', authRateLimit, authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/notes/:noteId/attachments', noteAttachmentsRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/labels', labelsRouter);
  app.use('/api/attachments', attachmentFilesRouter);
  // /api/export and /api/import/keep
  app.use('/api', dataTransferRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    next();
  });

  // index.html and the service worker script must never be cached by the browser (or a proxy in
  // between) -- workbox's precache manifest (which is what actually makes a new build's JS/CSS get
  // fetched) lives inside sw.js, and the hashed asset filenames a new build needs are referenced from
  // index.html, so a stale copy of *either* keeps an installed PWA on the old build indefinitely no
  // matter how aggressively the app's own update-check code (src/main.tsx) polls -- there's nothing
  // left for it to discover if the browser never re-requests these two.
  app.use(
    express.static(DIST_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
