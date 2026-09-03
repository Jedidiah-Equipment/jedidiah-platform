import { addDateOnlyDays, lastWorkingDayOnOrBefore, type WorkingCalendar } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';

export type MaintainedHorizonWarning = {
  bayId: string;
  maintainedThrough: DateOnlyIso;
  /** Inclusive last working day of the queue — the label date, not the half-open queue end. */
  queueLastWorkDay: DateOnlyIso;
};

type MaintainedHorizonBay = {
  id: string;
  nextAvailableDate: DateOnlyIso;
};

type MaintainedHorizonOffDay = {
  date: DateOnlyIso;
};

export function getMaintainedHorizonWarnings({
  bays,
  offDays,
  workingCalendarsByBayId,
}: {
  bays: readonly MaintainedHorizonBay[];
  offDays: readonly MaintainedHorizonOffDay[];
  workingCalendarsByBayId: ReadonlyMap<string, WorkingCalendar>;
}): MaintainedHorizonWarning[] {
  const maintainedThrough = offDays.reduce<DateOnlyIso | null>(
    (latest, offDay) => (latest === null || offDay.date > latest ? offDay.date : latest),
    null,
  );

  if (maintainedThrough === null) {
    return [];
  }

  return bays.flatMap((bay) => {
    if (bay.nextAvailableDate <= maintainedThrough) {
      return [];
    }

    return [
      {
        bayId: bay.id,
        maintainedThrough,
        // The queue end is half-open, so the label walks back from the day before it. An empty
        // Bay's queue end is its raw schedule origin, which can sit on an off-day.
        queueLastWorkDay: lastWorkingDayOnOrBefore(
          addDateOnlyDays(bay.nextAvailableDate, -1),
          workingCalendarsByBayId.get(bay.id) ?? {},
        ),
      },
    ];
  });
}
