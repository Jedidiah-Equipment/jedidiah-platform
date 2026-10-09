import type { ContractingRole } from '@pkg/schema';
import { type JobActionName, type JobActionVerdict, type JobStatus, jobActionNames } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { deriveJobActions, type JobActor, judgeJobAction } from './job-actions.js';

const actor = (contractingRole: ContractingRole, userId = 'me'): JobActor =>
  createUserAccessSummary({ userId, equipmentRole: null, contractingRole });
const superAdmin = createUserAccessSummary({ userId: 'owner', equipmentRole: 'super-admin', contractingRole: null });

const statuses: JobStatus[] = ['upcoming', 'active', 'completed', 'priced', 'invoiced', 'cancelled'];
const verdicts: Record<string, JobActionVerdict> = {
  '✓': { allowed: true },
  n: { allowed: false, reason: 'no-permission', message: expect.any(String) },
  o: { allowed: false, reason: 'not-your-job', message: expect.any(String) },
  s: { allowed: false, reason: 'wrong-status', message: expect.any(String) },
  p: { allowed: false, reason: 'priced', message: expect.any(String) },
  c: { allowed: false, reason: 'closed', message: expect.any(String) },
};

/**
 * One row per action; one column per status, in the order Upcoming, Active, Completed, Priced,
 * Invoiced, Cancelled. ✓ allowed · n no permission · o not your Job · s wrong status · p Priced · c closed.
 */
type Matrix = Record<JobActionName, string>;

const manager: Matrix = {
  editSetup: '✓✓sscc',
  assignForeman: '✓✓sscc',
  assign: '✓✓sscc',
  patchTravel: '✓✓✓pcc',
  editMeasures: 's✓✓pcc',
  editChargeLines: 's✓✓pcc',
  priceChargeLines: 'nnnnnn',
  resolveGaps: 's✓✓pcc',
  editSignOffDetails: 'ss✓✓cc',
  editDieselLitres: 'ss✓pcc',
  complete: 's✓sscc',
  cancel: '✓✓✓pcc',
  price: 'nnnnnn',
  stampInvoice: 'nnnnnn',
  amendReadings: '✓✓✓✓cc',
  capture: '✓✓sscc',
  reportBreakdown: '✓✓sscc',
};
const admin: Matrix = { ...manager, priceChargeLines: 's✓✓pcc', price: 'ss✓pcc', stampInvoice: 'sss✓cc' };
const none: Matrix = Object.fromEntries(jobActionNames.map((action) => [action, 'nnnnnn'])) as Matrix;
const foremanOnOwnJob: Matrix = {
  ...none,
  assign: '✓✓sscc',
  patchTravel: '✓✓sscc',
  capture: '✓✓sscc',
  reportBreakdown: '✓✓sscc',
};
const foremanOnAnotherJob: Matrix = {
  ...none,
  assign: 'oooooo',
  patchTravel: 'oooooo',
  capture: 'oooooo',
  reportBreakdown: 'oooooo',
};
const workshopManager: Matrix = { ...none, reportBreakdown: '✓✓sscc' };
const invoicing: Matrix = { ...none, stampInvoice: 'sss✓cc' };

const cases: [string, JobActor, string | null, Matrix][] = [
  ['a contracting manager', actor('contracting-manager'), 'someone', manager],
  ['a contracting admin', actor('contracting-admin'), 'someone', admin],
  ['the spanning super-admin', superAdmin, null, admin],
  ['the Foreman on their own Job', actor('foreman', 'sipho'), 'sipho', foremanOnOwnJob],
  ['a Foreman on another Foreman’s Job', actor('foreman', 'sipho'), 'thabo', foremanOnAnotherJob],
  ['contracting invoicing', actor('contracting-invoicing'), 'someone', invoicing],
  ['the workshop manager', actor('workshop-manager'), 'someone', workshopManager],
];

describe('deriveJobActions', () => {
  test.each(cases)('judges every action for %s in every status', (_name, who, foremanUserId, matrix) => {
    for (const [column, status] of statuses.entries()) {
      const actions = deriveJobActions({ status, foremanUserId }, who);
      const expected = Object.fromEntries(
        jobActionNames.map((action) => [action, verdicts[[...matrix[action]][column] ?? '']]),
      );
      expect({ status, actions }).toEqual({ status, actions: expected });
    }
  });
});

describe('a refused verdict', () => {
  test('says why, in the words the Job sheet and the server both show', () => {
    const job = (status: JobStatus, foremanUserId = 'sipho') => ({ status, foremanUserId });
    const refusal = (action: JobActionName, status: JobStatus, who: JobActor, foremanUserId?: string) => {
      const verdict = judgeJobAction(action, job(status, foremanUserId), who);
      return verdict.allowed ? null : verdict.message;
    };
    const manager = actor('contracting-manager');
    const admin = actor('contracting-admin');
    const sipho = actor('foreman', 'sipho');
    expect(refusal('price', 'completed', manager)).toBe('You do not have permission to price the Job.');
    expect(refusal('assign', 'active', sipho, 'thabo')).toBe('This Job is assigned to another Foreman.');
    expect(refusal('editChargeLines', 'invoiced', admin)).toBe('This Job is Invoiced, so nothing on it can change.');
    expect(refusal('patchTravel', 'priced', admin)).toBe('This Job is Priced, so you can no longer change travel.');
    expect(refusal('editSetup', 'completed', admin)).toBe(
      'You can only change Job setup while the Job is Upcoming or Active.',
    );
    expect(refusal('patchTravel', 'completed', sipho)).toBe(
      'You can only change travel while the Job is Upcoming or Active.',
    );
    expect(refusal('editSignOffDetails', 'active', admin)).toBe(
      'You can only change sign-off details while the Job is Completed or Priced.',
    );
    expect(refusal('assignForeman', 'completed', manager)).toBe(
      'You can only assign the Foreman while the Job is Upcoming or Active.',
    );
  });
});
