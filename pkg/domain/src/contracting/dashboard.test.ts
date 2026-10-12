import { expect, test } from 'vitest';
import { machinesDueForService, orderJobsNeedingALook, orderUnsolvedBreakdowns } from './dashboard.js';

test('orders Jobs needing a look critical first, then by Job Number', () => {
  const job = (jobNumber: string, critical: number, warning: number) => ({
    jobNumber,
    assignmentAttention: { critical, warning },
  });
  const ordered = orderJobsNeedingALook([job('CJOB-00003', 0, 2), job('CJOB-00010', 1, 0), job('CJOB-00002', 3, 1)]);
  expect(ordered.map((entry) => entry.jobNumber)).toEqual(['CJOB-00002', 'CJOB-00010', 'CJOB-00003']);
});

test('orders unsolved Breakdowns Code Red first, then the longest waiting', () => {
  const breakdown = (id: string, urgency: 'code-red' | 'code-green', reportedAt: string) => ({
    id,
    urgency,
    reportedAt,
  });
  const ordered = orderUnsolvedBreakdowns([
    breakdown('green-old', 'code-green', '2026-10-01T08:00:00Z'),
    breakdown('red-new', 'code-red', '2026-10-11T08:00:00Z'),
    breakdown('red-old', 'code-red', '2026-10-05T08:00:00Z'),
  ]);
  expect(ordered.map((entry) => entry.id)).toEqual(['red-old', 'red-new', 'green-old']);
});

test('keeps only Machines due soon or overdue, overdue first, then the fewest hours to go', () => {
  const machine = (
    code: string,
    serviceDueStatus: 'unknown' | 'ok' | 'due-soon' | 'overdue',
    hoursToService: number | null,
  ) => ({ code, serviceDueStatus, hoursToService });
  const due = machinesDueForService([
    machine('TRAC-1', 'ok', 400),
    machine('TRAC-2', 'due-soon', 80),
    machine('TRAC-3', 'unknown', null),
    machine('TRAC-4', 'overdue', -5),
    machine('TRAC-5', 'due-soon', 20),
    machine('TRAC-6', 'overdue', -40),
  ]);
  expect(due.map((entry) => entry.code)).toEqual(['TRAC-6', 'TRAC-4', 'TRAC-5', 'TRAC-2']);
});
