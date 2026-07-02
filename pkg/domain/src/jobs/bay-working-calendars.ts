import type { BayCalendarExceptionDirection } from '@pkg/schema';

import type { WorkingCalendar } from './working-calendar.js';

type OffDayFact = { date: string };
type CalendarExceptionFact = { date: string; direction: BayCalendarExceptionDirection };

/** One Bay's effective calendar: org Off-Days overlaid with the Bay's Calendar Exceptions. */
export function bayWorkingCalendar(
  orgOffDays: ReadonlySet<string>,
  calendarExceptions: readonly CalendarExceptionFact[],
): WorkingCalendar {
  return {
    bayExceptions: new Map(calendarExceptions.map((exception) => [exception.date, exception.direction] as const)),
    orgOffDays,
  };
}

/** Builds the effective WorkingCalendar for every Bay, sharing one org Off-Day set across Bays. */
export function bayWorkingCalendars<TBay extends { id: string; calendarExceptions: readonly CalendarExceptionFact[] }>(
  bays: readonly TBay[],
  offDays: readonly OffDayFact[],
): Map<string, WorkingCalendar> {
  const orgOffDays = new Set(offDays.map((offDay) => offDay.date));

  return new Map(bays.map((bay) => [bay.id, bayWorkingCalendar(orgOffDays, bay.calendarExceptions)] as const));
}
