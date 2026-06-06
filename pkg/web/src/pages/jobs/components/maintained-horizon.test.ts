import { describe, expect, it } from 'vitest';

import { getMaintainedHorizonWarnings } from './maintained-horizon.js';

describe('getMaintainedHorizonWarnings', () => {
  it('returns no warnings when there are no org Off-Days', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableAt: '2026-06-20T00:00:00.000' }],
        offDays: [],
      }),
    ).toEqual([]);
  });

  it('warns when a Bay queue ends after the last marked Off-Day', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableAt: '2026-06-17T00:00:00.000' }],
        offDays: [{ date: '2026-06-16' }],
      }),
    ).toEqual([
      {
        bayId: 'bay-1',
        maintainedThrough: '2026-06-16',
        queueEndDate: '2026-06-17',
      },
    ]);
  });

  it('compares queue ends using Johannesburg business dates', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableAt: '2026-06-18T22:00:00.000Z' }],
        offDays: [{ date: '2026-06-18' }],
      }),
    ).toEqual([
      {
        bayId: 'bay-1',
        maintainedThrough: '2026-06-18',
        queueEndDate: '2026-06-19',
      },
    ]);
  });

  it('does not warn when a Bay queue ends on or before the maintained horizon', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [
          { id: 'bay-1', nextAvailableAt: '2026-06-16T00:00:00.000' },
          { id: 'bay-2', nextAvailableAt: '2026-06-15T00:00:00.000' },
        ],
        offDays: [{ date: '2026-06-16' }],
      }),
    ).toEqual([]);
  });

  it('only warns for Bays that exceed the maintained horizon', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [
          { id: 'bay-1', nextAvailableAt: '2026-06-16T00:00:00.000' },
          { id: 'bay-2', nextAvailableAt: '2026-06-18T00:00:00.000' },
        ],
        offDays: [{ date: '2026-06-16' }],
      }),
    ).toEqual([
      {
        bayId: 'bay-2',
        maintainedThrough: '2026-06-16',
        queueEndDate: '2026-06-18',
      },
    ]);
  });

  it('uses the latest Off-Day when Off-Days are unsorted', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableAt: '2026-06-18T00:00:00.000' }],
        offDays: [{ date: '2026-06-16' }, { date: '2026-06-20' }, { date: '2026-06-10' }],
      }),
    ).toEqual([]);
  });
});
