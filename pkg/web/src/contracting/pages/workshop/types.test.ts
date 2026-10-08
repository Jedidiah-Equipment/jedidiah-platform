import { breakdownStatuses } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import {
  isPickedStatuses,
  listedStatuses,
  quickFilterStatuses,
  reportPatchInput,
  STATUS_COLUMN_ID,
  toggleStatuses,
  workshopListFilters,
} from './types.js';

const status = (value: unknown) => [{ id: STATUS_COLUMN_ID, value }];

describe('listedStatuses', () => {
  it('asks for the unsolved Breakdowns until statuses are picked', () => {
    expect(listedStatuses([])).toEqual(['open', 'in-progress']);
    expect(listedStatuses([{ id: STATUS_COLUMN_ID, value: ['solved'] }])).toEqual(['solved']);
  });
});

describe('quickFilterStatuses', () => {
  it('offers the unsolved statuses holding a Breakdown, and one picked on its own after it empties', () => {
    expect(quickFilterStatuses({ open: 2, 'in-progress': 0, solved: 5 }, [])).toEqual(['open']);
    expect(quickFilterStatuses(undefined, [])).toEqual([]);
    expect(quickFilterStatuses(undefined, status(['in-progress']))).toEqual(['in-progress']);
  });
});

describe('toggleStatuses', () => {
  it('picks every status for All, and clears the pick when pressed again', () => {
    const every = toggleStatuses(status(['open']), breakdownStatuses);
    expect(isPickedStatuses(every, breakdownStatuses)).toBe(true);
    expect(toggleStatuses(every, breakdownStatuses)).toEqual([]);
  });
});

describe('workshopListFilters', () => {
  it('splits the Subject filter into Machines and Implements and reads the Reported days', () => {
    const filters = workshopListFilters([
      { id: 'subject', value: ['machine:m-1', 'implement:i-1', 'machine:m-2'] },
      { id: 'reportedAt', value: { start: '2026-10-01', end: '2026-10-08' } },
      { id: 'farm', value: ['f-1'] },
    ]);
    expect(filters).toMatchObject({
      machineIds: ['m-1', 'm-2'],
      implementIds: ['i-1'],
      farmIds: ['f-1'],
      jobIds: [],
      reportedFrom: '2026-10-01',
      reportedTo: '2026-10-08',
    });
    expect(workshopListFilters([])).not.toHaveProperty('reportedFrom');
  });
});

describe('reportPatchInput', () => {
  it('sends only the fields that changed since the last save, and no Job as null', () => {
    const saved = { description: 'Hose burst', urgency: 'code-red', jobId: 'job-1' } as const;
    expect(reportPatchInput('b', saved, { ...saved, urgency: 'code-green' })).toEqual({
      id: 'b',
      urgency: 'code-green',
    });
    expect(reportPatchInput('b', saved, { ...saved, jobId: '' })).toEqual({ id: 'b', jobId: null });
  });
});
