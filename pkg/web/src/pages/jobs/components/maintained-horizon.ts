import type { DateOnlyIso } from '@pkg/schema';

export type MaintainedHorizonWarning = {
  bayId: string;
  maintainedThrough: DateOnlyIso;
  queueEndDate: DateOnlyIso;
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
    const queueEndDate = bay.nextAvailableDate;

    if (queueEndDate <= maintainedThrough) {
      return [];
    }

    return [
      {
        bayId: bay.id,
        maintainedThrough,
        queueEndDate,
      },
    ];
  });
}
