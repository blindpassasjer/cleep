import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { attachSession } from './middleware/session.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { notesRouter } from './routes/notes.js';
import { labelsRouter } from './routes/labels.js';
import { noteAttachmentsRouter } from './routes/noteAttachments.js';
import { attachmentFilesRouter } from './routes/attachmentFiles.js';
import { purgeExpiredTrash } from './db/purgeTrash.js';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 6169;
const DIST_DIR = path.resolve(__dirname, '../dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(attachSession);

app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notes/:noteId/attachments', noteAttachmentsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/attachments', attachmentFilesRouter);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  next();
});

app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Cleep self-host server listening on port ${PORT}`);
});

const TRASH_PURGE_INTERVAL_MS = 60 * 60 * 1000;
purgeExpiredTrash().catch((err) => console.error('Initial trash purge failed:', err));
setInterval(() => {
  purgeExpiredTrash().catch((err) => console.error('Scheduled trash purge failed:', err));
}, TRASH_PURGE_INTERVAL_MS);
