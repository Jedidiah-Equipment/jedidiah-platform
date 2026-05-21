import { describe, expect, it } from 'vitest';

import { deriveJobStatus, deriveLevelStatus, evaluateActualWriteGuard } from './status.js';

const startedAt = '2026-05-21T08:00:00.000Z';
const endedAt = '2026-05-21T10:00:00.000Z';

describe('deriveJobStatus', () => {
  it.each([
    [{ actualEnd: null, actualStart: null, isCancelled: false, isPaused: false }, 'not-started'],
    [{ actualEnd: null, actualStart: startedAt, isCancelled: false, isPaused: false }, 'active'],
    [{ actualEnd: endedAt, actualStart: null, isCancelled: false, isPaused: false }, 'complete'],
    [{ actualEnd: endedAt, actualStart: startedAt, isCancelled: false, isPaused: false }, 'complete'],
    [{ actualEnd: null, actualStart: null, isCancelled: false, isPaused: true }, 'paused'],
    [{ actualEnd: null, actualStart: startedAt, isCancelled: false, isPaused: true }, 'paused'],
    [{ actualEnd: endedAt, actualStart: startedAt, isCancelled: false, isPaused: true }, 'paused'],
    [{ actualEnd: null, actualStart: null, isCancelled: true, isPaused: false }, 'cancelled'],
    [{ actualEnd: null, actualStart: startedAt, isCancelled: true, isPaused: false }, 'cancelled'],
    [{ actualEnd: endedAt, actualStart: startedAt, isCancelled: true, isPaused: false }, 'cancelled'],
    [{ actualEnd: null, actualStart: null, isCancelled: true, isPaused: true }, 'cancelled'],
    [{ actualEnd: endedAt, actualStart: startedAt, isCancelled: true, isPaused: true }, 'cancelled'],
  ] as const)('derives %s as %s', (input, expected) => {
    expect(deriveJobStatus(input)).toBe(expected);
  });
});

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
    [
      { isCancelled: false, isPaused: false },
      { allowed: true, reason: null },
    ],
    [
      { isCancelled: false, isPaused: true },
      { allowed: false, reason: 'Job is paused.' },
    ],
    [
      { isCancelled: true, isPaused: false },
      { allowed: false, reason: 'Job is cancelled.' },
    ],
    [
      { isCancelled: true, isPaused: true },
      { allowed: false, reason: 'Job is cancelled.' },
    ],
  ] as const)('evaluates %s as %s', (input, expected) => {
    expect(evaluateActualWriteGuard(input)).toEqual(expected);
  });
});
