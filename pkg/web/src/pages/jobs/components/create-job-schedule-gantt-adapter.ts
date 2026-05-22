import { departmentLabels } from '@pkg/domain';
import type { Station } from '@pkg/schema';

import type { OptimisticDueRange, ScheduleGanttRow } from '@/pages/job-detail/components/schedule-gantt-helpers.js';

import type { StageDraft } from './create-job-dialog-helpers.js';

export type CreateScheduleGanttEdit =
  | {
      anchorDate: string;
      anchorKind: 'end' | 'start';
      kind: 'anchor';
    }
  | {
      kind: 'stages';
      stages: StageDraft[];
    };

export function buildCreateScheduleGanttRows({
  stages,
  stations,
}: {
  stages: StageDraft[];
  stations: Station[];
}): ScheduleGanttRow[] {
  const stationNamesById = new Map(stations.map((station) => [station.id, station.name]));
  const jobWindow = getDraftWindow(stages.flatMap((stage) => stage.stationBookings));

  return [
    {
      actualEnd: null,
      actualStart: null,
      dueEnd: jobWindow.dueEnd,
      dueStart: jobWindow.dueStart,
      entityId: 'create-job',
      id: 'create-job',
      level: 'job',
      parentId: null,
      stationId: null,
      statusLabel: 'Draft',
      title: 'Draft Job',
    },
    ...stages.flatMap((stage) => {
      const stageRowId = getCreateStageRowId(stage.stage);

      return [
        {
          actualEnd: null,
          actualStart: null,
          ...getDraftWindow(stage.stationBookings),
          entityId: stage.stage,
          id: stageRowId,
          level: 'stage' as const,
          parentId: null,
          stationId: null,
          statusLabel: 'Draft',
          title: departmentLabels[stage.stage],
        },
        ...stage.stationBookings.map((booking) => ({
          actualEnd: null,
          actualStart: null,
          dueEnd: booking.dueEnd || null,
          dueStart: booking.dueStart || null,
          entityId: booking.id,
          id: getCreateStationRowId(booking.id),
          level: 'station' as const,
          parentId: stageRowId,
          stationId: booking.stationId,
          statusLabel: 'Draft',
          title: stationNamesById.get(booking.stationId) ?? 'Selected Station',
        })),
      ];
    }),
  ];
}

export function applyCreateScheduleGanttDueRangeEdit({
  nextRange,
  row,
  stages,
}: {
  anchorKind: 'end' | 'start';
  nextRange: OptimisticDueRange;
  row: ScheduleGanttRow;
  stages: StageDraft[];
}): CreateScheduleGanttEdit {
  const dueStartChanged = row.dueStart !== nextRange.dueStart;
  const dueEndChanged = row.dueEnd !== nextRange.dueEnd;

  if (row.level !== 'station') {
    return { kind: 'stages', stages };
  }

  return {
    kind: 'stages',
    stages: stages.map((stage) => ({
      ...stage,
      stationBookings: stage.stationBookings.map((booking) =>
        booking.id === row.entityId
          ? {
              ...booking,
              dueEnd: nextRange.dueEnd,
              dueEndSetManually: dueEndChanged ? true : booking.dueEndSetManually,
              dueStart: nextRange.dueStart,
              dueStartSetManually: dueStartChanged ? true : booking.dueStartSetManually,
            }
          : booking,
      ),
    })),
  };
}

function getCreateStageRowId(stage: string): string {
  return `create-stage-${stage}`;
}

function getCreateStationRowId(bookingId: string): string {
  return `create-station-${bookingId}`;
}

function getDraftWindow(bookings: { dueEnd: string; dueStart: string }[]): {
  dueEnd: string | null;
  dueStart: string | null;
} {
  const dueStarts = bookings
    .map((booking) => booking.dueStart)
    .filter((value) => value !== '')
    .sort();
  const dueEnds = bookings
    .map((booking) => booking.dueEnd)
    .filter((value) => value !== '')
    .sort();

  return {
    dueEnd: dueEnds.at(-1) ?? null,
    dueStart: dueStarts[0] ?? null,
  };
}
