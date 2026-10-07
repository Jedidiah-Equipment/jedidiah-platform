import type { ContractingRole } from '@pkg/schema';
import {
  type BreakdownActionName,
  type BreakdownActionVerdict,
  type BreakdownStatus,
  breakdownActionNames,
} from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { type BreakdownActor, deriveBreakdownActions, judgeBreakdownAction } from './breakdown-actions.js';

const actor = (contractingRole: ContractingRole, userId = 'me'): BreakdownActor =>
  createUserAccessSummary({ userId, equipmentRole: null, contractingRole });
const superAdmin = createUserAccessSummary({ userId: 'owner', equipmentRole: 'super-admin', contractingRole: null });

const statuses: BreakdownStatus[] = ['open', 'in-progress', 'solved'];
const verdicts: Record<string, BreakdownActionVerdict> = {
  '✓': { allowed: true },
  n: { allowed: false, reason: 'no-permission', message: expect.any(String) },
  o: { allowed: false, reason: 'not-yours', message: expect.any(String) },
  s: { allowed: false, reason: 'wrong-status', message: expect.any(String) },
  x: { allowed: false, reason: 'solved', message: expect.any(String) },
};

/**
 * One row per action; one column per status, in the order Open, In Progress, Solved.
 * ✓ allowed · n no permission · o not yours · s wrong status · x Solved.
 */
type Matrix = Record<BreakdownActionName, string>;

const workshop: Matrix = {
  editReport: '✓✓x',
  addPhotos: '✓✓x',
  addNote: '✓✓✓',
  assignMechanic: '✓✓x',
  start: '✓sx',
  solve: '✓✓x',
};
const none: Matrix = Object.fromEntries(breakdownActionNames.map((action) => [action, 'nnn'])) as Matrix;
const reporterOnOwn: Matrix = { ...none, editReport: '✓✓x', addPhotos: '✓✓x', addNote: '✓✓✓' };
const reporterOnAnother: Matrix = { ...none, editReport: 'ooo', addPhotos: 'ooo', addNote: 'ooo' };

const cases: [string, BreakdownActor, { reportedByUserId: string; jobForemanUserId: string | null }, Matrix][] = [
  ['the workshop manager', actor('workshop-manager'), { reportedByUserId: 'sipho', jobForemanUserId: null }, workshop],
  [
    'a contracting manager',
    actor('contracting-manager'),
    { reportedByUserId: 'sipho', jobForemanUserId: null },
    workshop,
  ],
  ['the spanning super-admin', superAdmin, { reportedByUserId: 'sipho', jobForemanUserId: null }, workshop],
  [
    'the Foreman who reported it',
    actor('foreman', 'sipho'),
    { reportedByUserId: 'sipho', jobForemanUserId: null },
    reporterOnOwn,
  ],
  [
    'the Foreman of its Job',
    actor('foreman', 'sipho'),
    { reportedByUserId: 'thabo', jobForemanUserId: 'sipho' },
    reporterOnOwn,
  ],
  [
    'another Foreman',
    actor('foreman', 'sipho'),
    { reportedByUserId: 'thabo', jobForemanUserId: 'thabo' },
    reporterOnAnother,
  ],
  ['contracting invoicing', actor('contracting-invoicing'), { reportedByUserId: 'me', jobForemanUserId: null }, none],
];

describe('deriveBreakdownActions', () => {
  test.each(cases)('judges every action for %s in every status', (_name, who, owner, matrix) => {
    for (const [column, status] of statuses.entries()) {
      const actions = deriveBreakdownActions({ status, ...owner }, who);
      const expected = Object.fromEntries(
        breakdownActionNames.map((action) => [action, verdicts[[...matrix[action]][column] ?? '']]),
      );
      expect({ status, actions }).toEqual({ status, actions: expected });
    }
  });
});

describe('a refused verdict', () => {
  test('says why, in the words every Breakdown screen and the server show', () => {
    const refusal = (action: BreakdownActionName, status: BreakdownStatus, who: BreakdownActor, reporter = 'sipho') => {
      const verdict = judgeBreakdownAction(action, { status, reportedByUserId: reporter, jobForemanUserId: null }, who);
      return verdict.allowed ? null : verdict.message;
    };
    const sipho = actor('foreman', 'sipho');
    const connor = actor('workshop-manager', 'connor');
    expect(refusal('solve', 'open', sipho)).toBe('You do not have permission to mark it Solved.');
    expect(refusal('editReport', 'open', sipho, 'thabo')).toBe('This Breakdown was reported by someone else.');
    expect(refusal('addPhotos', 'solved', connor)).toBe('This Breakdown is Solved, so nothing on it can change.');
    expect(refusal('start', 'in-progress', connor)).toBe('You can only start work while the Breakdown is Open.');
  });
});
