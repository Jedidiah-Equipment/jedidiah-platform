import {
  type AssignmentDetail,
  type AssignmentState,
  assignmentActionNames,
  type JobActionName,
  type JobActionVerdict,
  type JobDetail,
  type JobStatus,
  jobActionNames,
} from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { jobSheet } from './job-sheet.js';

const allowed: JobActionVerdict = { allowed: true };
const noPermission: JobActionVerdict = { allowed: false, reason: 'no-permission', message: 'No.' };

function job(
  status: JobStatus,
  {
    seesMoney = true,
    verdicts = {},
    assignments = [],
  }: {
    seesMoney?: boolean;
    verdicts?: Partial<Record<JobActionName, JobActionVerdict>>;
    assignments?: AssignmentDetail[];
  } = {},
) {
  return {
    status,
    seesMoney,
    assignments,
    actions: Object.fromEntries(jobActionNames.map((name) => [name, verdicts[name] ?? allowed])),
  } as unknown as JobDetail;
}

function stint(id: string, machineId: string, state: AssignmentState, arrivedAt: string | null, createdAt: string) {
  return {
    id,
    machineId,
    state,
    createdAt,
    arrival: arrivedAt ? { at: arrivedAt } : null,
    actions: Object.fromEntries(assignmentActionNames.map((name) => [name, allowed])),
  } as unknown as AssignmentDetail;
}

describe('jobSheet stints', () => {
  const order = (assignments: AssignmentDetail[]) =>
    jobSheet(job('active', { assignments })).stints.map(({ stint, number }) => [stint.id, number]);

  it('lists on site, then planned, then left, grouped per Machine by first arrival within a tier', () => {
    const assignments = [
      stint('b-left', 'b', 'left', '2026-09-02T08:00:00Z', '2026-09-01T07:00:00Z'),
      stint('a-back', 'a', 'left', '2026-09-05T08:00:00Z', '2026-09-04T07:00:00Z'),
      stint('c-plan-new', 'c', 'planned', null, '2026-09-06T07:00:00Z'),
      stint('a-first', 'a', 'left', '2026-09-01T08:00:00Z', '2026-09-01T06:00:00Z'),
      stint('d-site', 'd', 'on-site', '2026-09-03T08:00:00Z', '2026-09-03T07:00:00Z'),
      stint('e-plan-old', 'e', 'planned', null, '2026-09-02T07:00:00Z'),
    ];
    expect(order(assignments)).toEqual([
      ['d-site', 1],
      ['e-plan-old', 1],
      ['c-plan-new', 1],
      ['a-first', 1],
      ['a-back', 2],
      ['b-left', 1],
    ]);
  });

  it('numbers a planned stint after the Machine’s arrived ones', () => {
    const assignments = [
      stint('a-again', 'a', 'planned', null, '2026-09-04T07:00:00Z'),
      stint('a-site', 'a', 'on-site', '2026-09-03T08:00:00Z', '2026-09-03T07:00:00Z'),
      stint('a-first', 'a', 'left', '2026-09-01T08:00:00Z', '2026-09-01T07:00:00Z'),
    ];
    expect(order(assignments)).toEqual([
      ['a-site', 2],
      ['a-again', 3],
      ['a-first', 1],
    ]);
  });

  it('reads each stint’s own Assignment Actions', () => {
    const refused = stint('a', 'a', 'left', '2026-09-01T08:00:00Z', '2026-09-01T07:00:00Z');
    refused.actions.remove = { allowed: false, reason: 'arrived', message: 'Arrived.' } as never;
    const [entry] = jobSheet(job('active', { assignments: [refused] })).stints;
    expect([entry?.sheet.can('remove'), entry?.sheet.refusal('remove')]).toEqual([false, 'Arrived.']);
  });

  it('leaves the Job’s own assignments untouched', () => {
    const assignments = [
      stint('left', 'a', 'left', '2026-09-01T08:00:00Z', '2026-09-01T07:00:00Z'),
      stint('site', 'b', 'on-site', '2026-09-02T08:00:00Z', '2026-09-02T07:00:00Z'),
    ];
    const before = [...assignments];
    jobSheet(job('active', { assignments }));
    expect(assignments).toEqual(before);
  });
});

describe('jobSheet money and progress', () => {
  it.each([
    ['upcoming', [false, false, false, false]],
    ['active', [true, false, false, false]],
    ['completed', [true, true, true, false]],
    ['priced', [true, true, true, false]],
    ['invoiced', [true, true, true, false]],
    ['cancelled', [false, false, false, false]],
  ] as const)('reads a %s Job as started, finished, money with and without seesMoney', (status, expected) => {
    const sheet = jobSheet(job(status));
    const withoutMoney = jobSheet(job(status, { seesMoney: false }));
    expect([sheet.started, sheet.finished, sheet.showsMoney, withoutMoney.showsMoney]).toEqual(expected);
  });
});

describe('jobSheet card visibility', () => {
  it.each([
    ['upcoming', [false, false, false]],
    ['active', [true, true, false]],
    ['completed', [true, false, false]],
    ['priced', [true, false, true]],
    ['invoiced', [true, false, true]],
    ['cancelled', [false, true, false]],
  ] as const)('shows the cards of a %s Job', (status, shown) => {
    const sheet = jobSheet(job(status));
    expect([sheet.showsSignOff, sheet.showsChargeLines, sheet.showsInvoice]).toEqual(shown);
  });

  it('shows Charge Lines instead of the Invoice to a reader without money', () => {
    const sheet = jobSheet(job('priced', { seesMoney: false }));
    expect([sheet.showsChargeLines, sheet.showsInvoice]).toEqual([true, false]);
  });

  it('hides Sign-off from a person without the permission', () => {
    expect(jobSheet(job('active', { verdicts: { editSignOffDetails: noPermission } })).showsSignOff).toBe(false);
  });
});
