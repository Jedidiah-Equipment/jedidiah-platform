import { addDateOnlyDays } from '@pkg/domain';
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
}: {
  bays: readonly MaintainedHorizonBay[];
  offDays: readonly MaintainedHorizonOffDay[];
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
        // The queue end is the last Slot's half-open `endDate`, so the day before it is that
        // Slot's last working day.
        queueLastWorkDay: addDateOnlyDays(bay.nextAvailableDate, -1),
      },
    ];
  });
}
