import { toJobDateKey } from './job-date-key.js';

export type MaintainedHorizonWarning = {
  bayId: string;
  maintainedThrough: string;
  queueEndDate: string;
};

type MaintainedHorizonBay = {
  id: string;
  nextAvailableAt: string;
};

type MaintainedHorizonOffDay = {
  date: string;
};

export function getMaintainedHorizonWarnings({
  bays,
  offDays,
}: {
  bays: readonly MaintainedHorizonBay[];
  offDays: readonly MaintainedHorizonOffDay[];
}): MaintainedHorizonWarning[] {
  const maintainedThrough = offDays.reduce<string | null>(
    (latest, offDay) => (latest === null || offDay.date > latest ? offDay.date : latest),
    null,
  );

  if (maintainedThrough === null) {
    return [];
  }

  return bays.flatMap((bay) => {
    const queueEndDate = toJobDateKey(new Date(bay.nextAvailableAt));

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
