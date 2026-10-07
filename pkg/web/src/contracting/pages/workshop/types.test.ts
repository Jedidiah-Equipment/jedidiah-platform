import {
  type BreakdownActionName,
  type BreakdownActionVerdict,
  type BreakdownDetail,
  breakdownActionNames,
} from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { breakdownSheet, listedStatuses, reportPatchInput, STATUS_COLUMN_ID } from './types.js';

const allowed: BreakdownActionVerdict = { allowed: true };
const breakdown = (verdicts: Partial<Record<BreakdownActionName, BreakdownActionVerdict>>) =>
  ({
    actions: Object.fromEntries(breakdownActionNames.map((name) => [name, verdicts[name] ?? allowed])),
  }) as unknown as BreakdownDetail;

describe('breakdownSheet', () => {
  it('hides an action the person lacks, and disables one the Breakdown refuses with its reason', () => {
    const sheet = breakdownSheet(
      breakdown({
        solve: { allowed: false, reason: 'no-permission', message: 'You do not have permission to mark it Solved.' },
        start: {
          allowed: false,
          reason: 'wrong-status',
          message: 'You can only start work while the Breakdown is Open.',
        },
      }),
    );
    expect(sheet.action('solve')).toBeNull();
    expect(sheet.action('start')).toEqual({
      disabled: true,
      title: 'You can only start work while the Breakdown is Open.',
    });
    expect(sheet.action('addNote')).toEqual({ disabled: false, title: undefined });
  });
});

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
