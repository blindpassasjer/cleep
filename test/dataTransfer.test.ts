import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import { createUserAndLogin } from './helpers.js';

function zipBuffer(entries: { name: string; body: string | Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive();
    const chunks: Buffer[] = [];
    archive.on('data', (c) => chunks.push(c));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const e of entries) archive.append(e.body, { name: e.name });
    archive.finalize();
  });
}

describe('export', () => {
  it('bundles the user\'s notes and labels into a zip', async () => {
    const { agent } = await createUserAndLogin();
    await agent.post('/api/notes').send({ title: 'Keep me', content: 'body', color: 'red' });

    const res = await agent.get('/api/export').buffer().parse((r, cb) => {
      const parts: Buffer[] = [];
      r.on('data', (d: Buffer) => parts.push(d));
      r.on('end', () => cb(null, Buffer.concat(parts)));
    });
    expect(res.status).toBe(200);

    const dir = await unzipper.Open.buffer(res.body as Buffer);
    const names = dir.files.map((f) => f.path);
    expect(names).toEqual(expect.arrayContaining(['manifest.json', 'notes.json', 'labels.json']));
    const notes = JSON.parse((await dir.files.find((f) => f.path === 'notes.json')!.buffer()).toString());
    expect(notes[0]).toMatchObject({ title: 'Keep me', color: 'red' });
  });
});

describe('Google Keep import', () => {
  it('creates notes, checklists and labels from a Takeout archive', async () => {
    const { agent } = await createUserAndLogin();
    const buf = await zipBuffer([
      {
        name: 'Takeout/Keep/note1.json',
        body: JSON.stringify({
          title: 'Shopping',
          listContent: [
            { text: 'Milk', isChecked: false },
            { text: 'Bread', isChecked: true },
          ],
          color: 'BLUE',
          isPinned: true,
          labels: [{ name: 'Errands' }],
          userEditedTimestampUsec: 1_700_000_000_000_000,
        }),
      },
      {
        name: 'Takeout/Keep/note2.json',
        body: JSON.stringify({ title: 'Trashed', textContent: 'gone', isTrashed: true }),
      },
    ]);

    const res = await agent.post('/api/import/keep').attach('file', buf, 'takeout.zip');
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skippedTrashed).toBe(1);

    const notes = (await agent.get('/api/notes')).body.notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: 'Shopping', isChecklist: true, pinned: true, color: 'blue' });
    expect(notes[0].items.map((i: { text: string }) => i.text)).toEqual(['Milk', 'Bread']);

    const labels = (await agent.get('/api/labels')).body.labels;
    expect(labels.map((l: { name: string }) => l.name)).toContain('Errands');
  });

  it('rejects a non-zip upload', async () => {
    const { agent } = await createUserAndLogin();
    const res = await agent.post('/api/import/keep').attach('file', Buffer.from('not a zip'), 'x.zip');
    expect(res.status).toBe(400);
  });
});
