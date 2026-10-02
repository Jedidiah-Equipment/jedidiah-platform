import { expect, test } from 'vitest';
import { visibleFieldNotes } from './note-list';

const note = (id: string, status: 'open' | 'closed', createdAt: string, description = '') => ({
  id,
  status,
  createdAt,
  description,
  photos: [],
});
const notes = [
  note('a', 'open', '2026-10-01T06:00:00Z', 'T12 at Rietfontein'),
  note('b', 'closed', '2026-10-01T07:00:00Z', 'T14 at Rietfontein'),
  note('c', 'open', '2026-10-01T08:00:00Z', 'Meter fogged on t12'),
];

test('shows the chosen status, newest first', () => {
  expect(visibleFieldNotes(notes, { status: 'open', search: '' }).map((row) => row.id)).toEqual(['c', 'a']);
  expect(visibleFieldNotes(notes, { status: 'closed', search: '' }).map((row) => row.id)).toEqual(['b']);
});

test('searches the description, ignoring case and surrounding spaces', () => {
  expect(visibleFieldNotes(notes, { status: 'open', search: '  T12 ' }).map((row) => row.id)).toEqual(['c', 'a']);
  expect(visibleFieldNotes(notes, { status: 'open', search: 'fogged' }).map((row) => row.id)).toEqual(['c']);
  expect(visibleFieldNotes(notes, { status: 'closed', search: 'fogged' })).toEqual([]);
});
