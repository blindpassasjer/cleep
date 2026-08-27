import { assertRequiredEnv, createApp } from './app.js';
import { purgeExpiredTrash } from './db/purgeTrash.js';

assertRequiredEnv();

const PORT = Number(process.env.PORT) || 6169;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Cleep self-host server listening on port ${PORT}`);
});

const TRASH_PURGE_INTERVAL_MS = 60 * 60 * 1000;
purgeExpiredTrash().catch((err) => console.error('Initial trash purge failed:', err));
setInterval(() => {
  purgeExpiredTrash().catch((err) => console.error('Scheduled trash purge failed:', err));
}, TRASH_PURGE_INTERVAL_MS);
