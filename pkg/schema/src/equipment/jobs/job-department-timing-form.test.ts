import { describe, expect, it } from 'vitest';

import { JobDepartmentTimingCorrectionValues } from './job.js';

describe('JobDepartmentTimingCorrectionValues', () => {
  it('enforces stamp ordering and requires crew only when work is done', () => {
    expect(
      JobDepartmentTimingCorrectionValues.parse({
        completedOn: '2026-08-28',
        crewUserIds: ['crew-id'],
        startedOn: '2026-08-27',
      }),
    ).toEqual({ completedOn: '2026-08-28', crewUserIds: ['crew-id'], startedOn: '2026-08-27' });

    expect(() =>
      JobDepartmentTimingCorrectionValues.parse({
        completedOn: '2026-08-26',
        crewUserIds: ['crew-id'],
        startedOn: '2026-08-27',
      }),
    ).toThrow('The done date cannot be before the start date.');
    expect(() =>
      JobDepartmentTimingCorrectionValues.parse({
        completedOn: '2026-08-28',
        crewUserIds: [],
        startedOn: '2026-08-27',
      }),
    ).toThrow('Name at least one crew member.');
    expect(() =>
      JobDepartmentTimingCorrectionValues.parse({
        completedOn: '2026-08-28',
        crewUserIds: ['crew-id'],
        startedOn: null,
      }),
    ).toThrow('A done date needs a start date.');
  });
});
