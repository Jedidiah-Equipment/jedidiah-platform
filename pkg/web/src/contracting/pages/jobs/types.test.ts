import {
  type JobActionName,
  type JobActionVerdict,
  type JobDetail,
  type JobStatus,
  jobActionNames,
} from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { jobSheet, toJobCreateInput } from './types.js';

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
