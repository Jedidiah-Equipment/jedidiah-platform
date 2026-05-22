import { describe, expect, it } from 'vitest';

import { deriveLevelStatus, evaluateActualWriteGuard } from './status.js';

const startedAt = '2026-05-21T08:00:00.000Z';
const endedAt = '2026-05-21T10:00:00.000Z';

describe('deriveLevelStatus', () => {
  it.each([
    [{ actualEnd: null, actualStart: null }, 'pending'],
    [{ actualEnd: null, actualStart: startedAt }, 'in-progress'],
    [{ actualEnd: endedAt, actualStart: null }, 'complete'],
    [{ actualEnd: endedAt, actualStart: startedAt }, 'complete'],
  ] as const)('derives %s as %s', (input, expected) => {
    expect(deriveLevelStatus(input)).toBe(expected);
  });
});

describe('evaluateActualWriteGuard', () => {
  it.each([
    [{ status: 'active' }, { allowed: true, reason: null }],
    [{ status: 'pending' }, { allowed: false, reason: 'Job status must be active to start or stop station bookings.' }],
    [{ status: 'paused' }, { allowed: false, reason: 'Job status must be active to start or stop station bookings.' }],
    [
      { status: 'complete' },
      { allowed: false, reason: 'Job status must be active to start or stop station bookings.' },
    ],
    [
      { status: 'cancelled' },
      { allowed: false, reason: 'Job status must be active to start or stop station bookings.' },
    ],
  ] as const)('evaluates %s as %s', (input, expected) => {
    expect(evaluateActualWriteGuard(input)).toEqual(expected);
  });
});
