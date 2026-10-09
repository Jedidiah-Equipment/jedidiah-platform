import {
  type JobActionName,
  type JobActionVerdict,
  type JobDetail,
  type JobStatus,
  jobActionNames,
} from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { breakdownsByStint, jobSheet, toJobCreateInput } from './types.js';

const allowed: JobActionVerdict = { allowed: true };

function job(status: JobStatus, verdicts: Partial<Record<JobActionName, JobActionVerdict>> = {}) {
  return {
    status,
    pricing: {},
    actions: Object.fromEntries(jobActionNames.map((name) => [name, verdicts[name] ?? allowed])),
  } as unknown as JobDetail;
}

describe('Job sign-off helpers', () => {
  it('maps browser values to a create input', () => {
    const id = '5f1c2d3e-0001-4a00-8000-000000000001';
    expect(
      toJobCreateInput({ customerId: id, farmId: id, workTypeId: id, description: '  Dam  ', foremanUserId: '' }),
    ).toEqual({
      customerId: id,
      farmId: id,
      workTypeId: id,
      description: 'Dam',
      foremanUserId: null,
    });
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

  it('hides Sign-off from a person without the permission', () => {
    const noPermission: JobActionVerdict = { allowed: false, reason: 'no-permission', message: 'No.' };
    expect(jobSheet(job('active', { editSignOffDetails: noPermission })).showsSignOff).toBe(false);
  });
});

describe('jobSheet action', () => {
  it('is null without the permission', () => {
    const sheet = jobSheet(job('active', { price: { allowed: false, reason: 'no-permission', message: 'No.' } }));
    expect(sheet.action('price')).toBeNull();
  });

  it('is enabled when allowed', () => {
    expect(jobSheet(job('completed')).action('price')).toEqual({ disabled: false, title: undefined });
  });

  it('is disabled with the refusal when the Job refuses it', () => {
    const message = 'This Job is Priced, so you can no longer price the Job.';
    const priced = job('priced', { price: { allowed: false, reason: 'priced', message } });
    expect(jobSheet(priced).action('price')).toEqual({ disabled: true, title: message });
  });
});

describe('jobSheet refusal', () => {
  it('reads a refusal from the served verdict', () => {
    const sheet = jobSheet(job('priced', { cancel: { allowed: false, reason: 'priced', message: 'X' } }));
    expect([sheet.can('cancel'), sheet.holds('cancel'), sheet.refusal('cancel')]).toEqual([false, true, 'X']);
  });
});

describe('breakdownsByStint', () => {
  const machineId = '5f1c2d3e-0001-4a00-8000-0000000000aa';
  const implementId = '5f1c2d3e-0001-4a00-8000-0000000000bb';
  const stint = (id: string, arrivedAt: string | null, implement: string | null = null) => ({
    id,
    machineId,
    implementId: implement,
    createdAt: '2026-10-01T06:00:00.000Z',
    arrival: arrivedAt ? { capturedAt: arrivedAt } : null,
  });
  const breakdown = (kind: 'machine' | 'implement', id: string, reportedAt: string) => ({
    subject: { kind, id },
    reportedAt,
  });

  it('puts a Breakdown on the stint of its subject that had started when it was reported', () => {
    const first = stint('first', '2026-10-02T06:00:00.000Z');
    const second = stint('second', '2026-10-05T06:00:00.000Z', implementId);
    const early = breakdown('machine', machineId, '2026-10-03T10:00:00.000Z');
    const late = breakdown('machine', machineId, '2026-10-06T10:00:00.000Z');
    const implement = breakdown('implement', implementId, '2026-10-06T11:00:00.000Z');
    const result = breakdownsByStint([second, first], [early, late, implement]);
    expect(result.get('first')).toEqual([early]);
    expect(result.get('second')).toEqual([late, implement]);
  });

  it('falls back to the earliest stint when reported before any arrival', () => {
    const result = breakdownsByStint(
      [stint('only', null)],
      [breakdown('machine', machineId, '2026-09-30T10:00:00.000Z')],
    );
    expect(result.get('only')).toHaveLength(1);
  });
});
