import type { ContractingRole } from '@pkg/schema';
import type { ActivityItem } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { canSeeActivity, presentActivityEvent } from './activity.js';

const access = (contractingRole: ContractingRole) =>
  createUserAccessSummary({ userId: 'me', equipmentRole: null, contractingRole });

describe('canSeeActivity', () => {
  test('opens Activity to a Jobs or a Workshop reach, and to no one else', () => {
    expect(canSeeActivity(access('foreman'))).toBe(true);
    expect(canSeeActivity(access('workshop-manager'))).toBe(true);
    expect(canSeeActivity(access('contracting-manager'))).toBe(true);
    expect(canSeeActivity(access('contracting-invoicing'))).toBe(false);
    expect(canSeeActivity(access('driver'))).toBe(false);
    expect(canSeeActivity(null)).toBe(false);
  });
});

describe('presentActivityEvent', () => {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    occurredAt: '2026-10-13T08:00:00.000Z',
    actor: { id: 'sipho', name: 'Sipho', thumbnailDataUrl: null },
  };
  const job = {
    id: '00000000-0000-4000-8000-000000000002',
    jobNumber: 'CJOB-00037',
    farmName: 'Rietvlei',
    customerName: 'Van Wyk Boerdery',
    foremanUserId: 'sipho',
  };
  const machine = {
    id: '00000000-0000-4000-8000-000000000003',
    code: 'T12',
    categoryIcon: 'tractor',
    categoryColour: 'blue',
  } as const;
  const breakdown = {
    id: '00000000-0000-4000-8000-000000000004',
    urgency: 'code-red',
    status: 'open',
    subject: { ...machine, kind: 'machine', categoryName: 'Tractors' },
    jobId: job.id,
  } as const;
  const present = (item: ActivityItem) => (item.type.endsWith('note') ? null : presentActivityEvent(item as never));

  test('names who did what to which record', () => {
    expect(
      present({ ...base, type: 'breakdown-reported', breakdown, job, firstLine: 'Hydraulic hose burst' } as never),
    ).toEqual({
      sentence: 'Sipho reported Code Red on T12 at CJOB-00037',
      detail: 'Hydraulic hose burst',
      tone: 'danger',
    });
    expect(present({ ...base, type: 'mechanic-assigned', breakdown, job: null, mechanicName: null } as never)).toEqual({
      sentence: 'Sipho cleared the Mechanic on T12',
      detail: null,
      tone: 'next',
    });
    expect(present({ ...base, type: 'job-cancelled', job, reason: 'Rain' } as never)?.sentence).toBe(
      'Sipho cancelled CJOB-00037',
    );
  });

  test('shows the hours, and the Read At only when it was backdated', () => {
    const hours = { ...base, job, machine, hours: 1234.5, photoBacked: false };
    expect(present({ ...hours, type: 'machine-arrived', readAt: base.occurredAt } as never)?.detail).toBe('1 234.5 h');
    expect(
      present({ ...hours, type: 'machine-left', readAt: '2026-10-12T15:00:00.000Z', photoBacked: true } as never)
        ?.detail,
    ).toMatch(/^1 234\.5 h · read .+ · photo$/);
  });
});
