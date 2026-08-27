import { describe, it, expect } from 'vitest';
import { createUserAndLogin } from './helpers.js';

async function createNote(agent: Awaited<ReturnType<typeof createUserAndLogin>>['agent'], title: string) {
  const res = await agent.post('/api/notes').send({ title, content: '', color: 'default' });
  expect(res.status).toBe(201);
  return res.body.note.id as string;
}

describe('note ownership isolation', () => {
  it('never lets one user touch another user\'s note', async () => {
    const alice = await createUserAndLogin();
    const bob = await createUserAndLogin();
    const noteId = await createNote(alice.agent, 'Alice private');

    expect((await bob.agent.patch(`/api/notes/${noteId}`).send({ title: 'hacked' })).status).toBe(404);
    expect((await bob.agent.post(`/api/notes/${noteId}/trash`)).status).toBe(404);
    expect((await bob.agent.delete(`/api/notes/${noteId}`)).status).toBe(404);

    // Alice's note is untouched.
    const list = await alice.agent.get('/api/notes');
    expect(list.body.notes).toHaveLength(1);
    expect(list.body.notes[0].title).toBe('Alice private');
  });

  it('returns an empty list (not an error) when filtering by a foreign label id', async () => {
    const alice = await createUserAndLogin();
    const bob = await createUserAndLogin();
    const bobLabel = await bob.agent.post('/api/labels').send({ name: 'Bob stuff' });
    await createNote(alice.agent, 'Alice note');

    const res = await alice.agent.get(`/api/notes?label=${bobLabel.body.label.id}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toEqual([]);
  });
});

describe('multi-label filtering', () => {
  it('supports any / all match modes', async () => {
    const { agent } = await createUserAndLogin();
    const work = (await agent.post('/api/labels').send({ name: 'Work' })).body.label.id;
    const urgent = (await agent.post('/api/labels').send({ name: 'Urgent' })).body.label.id;

    const both = await createNote(agent, 'Work + Urgent');
    const workOnly = await createNote(agent, 'Work only');
    await agent.put(`/api/notes/${both}/labels/${work}`);
    await agent.put(`/api/notes/${both}/labels/${urgent}`);
    await agent.put(`/api/notes/${workOnly}/labels/${work}`);

    const any = await agent.get(`/api/notes?label=${work}&label=${urgent}&labelMatch=any`);
    expect(any.body.notes.map((n: { title: string }) => n.title).sort()).toEqual(['Work + Urgent', 'Work only']);

    const all = await agent.get(`/api/notes?label=${work}&label=${urgent}&labelMatch=all`);
    expect(all.body.notes.map((n: { title: string }) => n.title)).toEqual(['Work + Urgent']);
  });
});
