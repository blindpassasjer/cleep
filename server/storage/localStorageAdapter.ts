import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from './StorageAdapter.js';

const attachmentsDir = process.env.ATTACHMENTS_DIR;
if (!attachmentsDir) {
  throw new Error('ATTACHMENTS_DIR environment variable is required.');
}
const ROOT = attachmentsDir;

/** Resolves a storage key to an absolute path, rejecting any attempt to escape ROOT. */
function resolveKeyPath(key: string): string {
  const resolved = path.resolve(ROOT, key);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (resolved !== ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return resolved;
}

/**
 * Filesystem-backed StorageAdapter, rooted at ATTACHMENTS_DIR. Keys are
 * "<userId>/<noteId>/<attachmentId>-<name>" so the bind-mounted host directory reads as plain,
 * browsable folders per user and note rather than an opaque blob store.
 */
export const localStorageAdapter: StorageAdapter = {
  async save(key, data) {
    const filePath = resolveKeyPath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, data);
  },

  async read(key) {
    const filePath = resolveKeyPath(key);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return null;
    }
    return {
      stream: fs.createReadStream(filePath),
      sizeBytes: stat.size,
    };
  },

  async delete(key) {
    const filePath = resolveKeyPath(key);
    try {
      await fsp.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  },
};
