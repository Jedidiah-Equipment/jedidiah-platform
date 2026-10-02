import { expect, test, vi } from 'vitest';

const observability = vi.hoisted(() => ({ addBreadcrumb: vi.fn(), captureEvent: vi.fn() }));
vi.mock('@/lib/observability', () => observability);

import { recordFieldNoteChanged, recordFieldNoteCreated } from './observability';

test('Field Note events carry counts and flags, never the note itself', () => {
  recordFieldNoteCreated({ hasPhoto: true, photoCount: 2, hasDescription: false });
  recordFieldNoteChanged('closed');
  recordFieldNoteChanged('reopened');
  recordFieldNoteChanged('deleted');

  expect(observability.captureEvent.mock.calls).toEqual([
    ['field note created', { hasPhoto: true, photoCount: 2, hasDescription: false }],
    ['field note closed'],
    ['field note reopened'],
    ['field note deleted'],
  ]);
});
