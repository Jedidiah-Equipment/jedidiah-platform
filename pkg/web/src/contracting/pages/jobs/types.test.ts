import { createUserAccessSummary } from '@pkg/domain';
import { jobActionRefusal } from '@pkg/domain/contracting';
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
    const sheet = jobSheet(job(status), null);
    expect([sheet.showsSignOff, sheet.showsChargeLines, sheet.showsInvoice]).toEqual(shown);
  });

  it('hides Sign-off from a person without the permission', () => {
    const noPermission: JobActionVerdict = { allowed: false, reason: 'no-permission' };
    expect(jobSheet(job('active', { editSignOffDetails: noPermission }), null).showsSignOff).toBe(false);
  });
});

describe('jobSheet action', () => {
  it('is null without the permission', () => {
    const sheet = jobSheet(job('active', { price: { allowed: false, reason: 'no-permission' } }), null);
    expect(sheet.action('price')).toBeNull();
  });

  it('is enabled when allowed', () => {
    expect(jobSheet(job('completed'), null).action('price')).toEqual({ disabled: false, title: undefined });
  });

  it('is disabled with the refusal when the Job refuses it', () => {
    const access = createUserAccessSummary({
      userId: 'manager',
      equipmentRole: null,
      contractingRole: 'contracting-manager',
    });
    const priced = job('priced', { price: { allowed: false, reason: 'priced' } });
    expect(jobSheet(priced, access).action('price')).toEqual({
      disabled: true,
      title: jobActionRefusal('price', 'priced', priced, access),
    });
  });
});
