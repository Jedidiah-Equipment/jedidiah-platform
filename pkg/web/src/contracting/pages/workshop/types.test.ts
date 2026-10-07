import { describe, expect, it } from 'vitest';
import { listedStatuses, reportPatchInput, STATUS_COLUMN_ID } from './types.js';

describe('listedStatuses', () => {
  it('asks for the unsolved Breakdowns until statuses are picked', () => {
    expect(listedStatuses([])).toEqual(['open', 'in-progress']);
    expect(listedStatuses([{ id: STATUS_COLUMN_ID, value: ['solved'] }])).toEqual(['solved']);
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
