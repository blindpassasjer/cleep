import type { Label, Note } from '../types';

// Fixed ids/timestamps so the seed is deterministic across resets instead of drifting each load.
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * 60 * 60 * 1000).toISOString();

export const DEMO_LABELS: Label[] = [
  { id: 'label-recipes', userId: 'demo-user', name: 'Recipes', color: 'orange' },
  { id: 'label-work', userId: 'demo-user', name: 'Work', color: 'blue' },
  { id: 'label-travel', userId: 'demo-user', name: 'Travel', color: 'teal' },
];

function note(partial: Partial<Note> & Pick<Note, 'id' | 'title' | 'content'>): Note {
  return {
    userId: 'demo-user',
    isChecklist: false,
    items: [],
    color: 'default',
    pinned: false,
    archived: false,
    isRecording: false,
    trashedAt: null,
    position: 0,
    createdAt: ago(1),
    updatedAt: ago(1),
    labelIds: [],
    attachments: [],
    ...partial,
  };
}

export function buildDemoNotes(): Note[] {
  return [
    note({
      id: 'note-welcome',
      title: 'Welcome to Cleep 👋',
      content:
        'This is a live demo — everything you do here (create, edit, drag, archive, trash) runs entirely in your browser and is saved to this device only. Nothing is sent to a server. Refresh and it\'s still here; use "Reset demo data" in Settings to start over.',
      color: 'yellow',
      pinned: true,
      position: 400,
      createdAt: ago(0),
      updatedAt: ago(0),
    }),
    note({
      id: 'note-packing',
      title: 'Trip packing list',
      content: '',
      isChecklist: true,
      items: [
        { id: 'i1', text: 'Passport', checked: true },
        { id: 'i2', text: 'Chargers', checked: true },
        { id: 'i3', text: 'Sunscreen', checked: false },
        { id: 'i4', text: 'Hiking boots', checked: false },
      ],
      color: 'teal',
      pinned: true,
      position: 300,
      labelIds: ['label-travel'],
      createdAt: ago(2),
      updatedAt: ago(1, 3),
    }),
    note({
      id: 'note-standup',
      title: 'Standup notes',
      content: '<p>- Ship the demo build<br>- Follow up with design on the color picker<br>- Review PR #142</p>',
      color: 'blue',
      position: 200,
      labelIds: ['label-work'],
      createdAt: ago(3),
      updatedAt: ago(2),
    }),
    note({
      id: 'note-focaccia',
      title: 'Focaccia recipe',
      content: '<p>500g flour, 375ml warm water, 10g yeast, 12g salt, olive oil. Overnight rise, dimple, bake at 220°C for 25 min.</p>',
      color: 'orange',
      position: 150,
      labelIds: ['label-recipes'],
      createdAt: ago(5),
      updatedAt: ago(4),
    }),
    note({
      id: 'note-books',
      title: 'Books to read',
      content: '',
      isChecklist: true,
      items: [
        { id: 'b1', text: 'Project Hail Mary', checked: false },
        { id: 'b2', text: 'The Pragmatic Programmer', checked: true },
      ],
      color: 'purple',
      position: 100,
      createdAt: ago(6),
      updatedAt: ago(5),
    }),
    note({
      id: 'note-quote',
      title: '',
      content: '<p>"Simplicity is prerequisite for reliability." — Edsger Dijkstra</p>',
      color: 'pink',
      position: 50,
      createdAt: ago(7),
      updatedAt: ago(7),
    }),
    note({
      id: 'note-archived-idea',
      title: 'Old side project idea',
      content: '<p>A browser extension that mutes autoplaying videos. Someone probably already built this.</p>',
      color: 'gray',
      archived: true,
      position: 10,
      createdAt: ago(20),
      updatedAt: ago(18),
    }),
  ];
}
