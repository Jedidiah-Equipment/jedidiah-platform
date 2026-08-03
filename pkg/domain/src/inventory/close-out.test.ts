import type { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { deriveCloseOutAge, STALE_CLOSE_OUT_DAYS } from './close-out.js';

const dateOnly = (value: string) => value as DateOnlyIso;

describe('deriveCloseOutAge', () => {
  it('measures whole days since Job Completion', () => {
    expect(deriveCloseOutAge({ completedOn: dateOnly('2026-08-01'), today: dateOnly('2026-08-04') })).toEqual({
      ageDays: 3,
      isStale: false,
    });
  });

  it('reads a Job completed today as nothing outstanding yet', () => {
    expect(deriveCloseOutAge({ completedOn: dateOnly('2026-08-04'), today: dateOnly('2026-08-04') })).toEqual({
      ageDays: 0,
      isStale: false,
    });
  });

  it('floors a future completion date at zero rather than reporting negative age', () => {
    expect(deriveCloseOutAge({ completedOn: dateOnly('2026-08-10'), today: dateOnly('2026-08-04') })).toEqual({
      ageDays: 0,
      isStale: false,
    });
  });

  it('flags the stale-commitment threshold from the day it is reached', () => {
    const today = dateOnly('2026-08-04');

    expect(deriveCloseOutAge({ completedOn: dateOnly('2026-07-06'), today })).toEqual({ ageDays: 29, isStale: false });
    expect(deriveCloseOutAge({ completedOn: dateOnly('2026-07-05'), today })).toEqual({ ageDays: 30, isStale: true });
    expect(STALE_CLOSE_OUT_DAYS).toBe(30);
  });
});
