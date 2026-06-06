import { formatJobSchedulingDateKey } from '@pkg/domain';

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
    const queueEndDate = formatJobSchedulingDateKey(new Date(bay.nextAvailableAt));

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

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
