import type { WorkingCalendar } from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getMaintainedHorizonWarnings } from './maintained-horizon.js';

const day = (value: string) => DateOnlyIso.parse(value);
const noCalendars = new Map<string, WorkingCalendar>();

describe('getMaintainedHorizonWarnings', () => {
  it('returns no warnings when there are no org Off-Days', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-20') }],
        offDays: [],
        workingCalendarsByBayId: noCalendars,
      }),
    ).toEqual([]);
  });

  it('warns when a Bay queue ends after the last marked Off-Day', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-17') }],
        offDays: [{ date: day('2026-06-16') }],
        workingCalendarsByBayId: noCalendars,
      }),
    ).toEqual([
      {
        bayId: 'bay-1',
        maintainedThrough: '2026-06-16',
        queueLastWorkDay: '2026-06-16',
      },
    ]);
  });

  it('walks the queue label back past off-days on the Bay calendar', () => {
    // The queue end sits past a weekend: the last working day is the Friday, not the Sunday.
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-22') }],
        offDays: [{ date: day('2026-06-16') }],
        workingCalendarsByBayId: new Map([['bay-1', { orgOffDays: new Set(['2026-06-20', '2026-06-21']) }]]),
      }),
    ).toEqual([
      {
        bayId: 'bay-1',
        maintainedThrough: '2026-06-16',
        queueLastWorkDay: '2026-06-19',
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
        workingCalendarsByBayId: noCalendars,
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
        workingCalendarsByBayId: noCalendars,
      }),
    ).toEqual([
      {
        bayId: 'bay-2',
        maintainedThrough: '2026-06-16',
        queueLastWorkDay: '2026-06-17',
      },
    ]);
  });

  it('uses the latest Off-Day when Off-Days are unsorted', () => {
    expect(
      getMaintainedHorizonWarnings({
        bays: [{ id: 'bay-1', nextAvailableDate: day('2026-06-18') }],
        offDays: [{ date: day('2026-06-16') }, { date: day('2026-06-20') }, { date: day('2026-06-10') }],
        workingCalendarsByBayId: noCalendars,
      }),
    ).toEqual([]);
  });
});
