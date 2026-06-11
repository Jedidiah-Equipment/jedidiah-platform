import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getMaintainedHorizonWarnings } from './maintained-horizon.js';

const day = (value: string) => DateOnlyIso.parse(value);

describe('getMaintainedHorizonWarnings', () => {
  it('returns no warnings when there are no org Off-Days', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-20') }],
        offDays: [],
      }),
    ).toEqual([]);
  });

  it('warns when a Bay queue ends after the last marked Off-Day', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-17') }],
        offDays: [{ date: day('2026-06-16') }],
      }),
    ).toEqual([
      {
        bayId: 'bay-1',
        maintainedThrough: '2026-06-16',
        queueEndDate: '2026-06-17',
      },
    ]);
  });

  it('does not warn when a Bay queue ends on or before the maintained horizon', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [
          { id: 'bay-1', nextAvailableDate: day('2026-06-16') },
          { id: 'bay-2', nextAvailableDate: day('2026-06-15') },
        ],
        offDays: [{ date: day('2026-06-16') }],
      }),
    ).toEqual([]);
  });

  it('only warns for Bays that exceed the maintained horizon', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [
          { id: 'bay-1', nextAvailableDate: day('2026-06-16') },
          { id: 'bay-2', nextAvailableDate: day('2026-06-18') },
        ],
        offDays: [{ date: day('2026-06-16') }],
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
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-18') }],
        offDays: [{ date: day('2026-06-16') }, { date: day('2026-06-20') }, { date: day('2026-06-10') }],
      }),
    ).toEqual([]);
  });
});
