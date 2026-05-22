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
  const firstStage = stages[0];
  const lastStage = stages[stages.length - 1];

  return [
    {
      actualEnd: null,
      actualStart: null,
      dueEnd: lastStage?.dueEnd || null,
      dueStart: firstStage?.dueStart || null,
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
          dueEnd: stage.dueEnd || null,
          dueStart: stage.dueStart || null,
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
  anchorKind,
  nextRange,
  row,
  stages,
}: {
  anchorKind: 'end' | 'start';
  nextRange: OptimisticDueRange;
  row: ScheduleGanttRow;
  stages: StageDraft[];
}): CreateScheduleGanttEdit {
  if (row.level === 'job') {
    if (row.dueStart !== nextRange.dueStart && row.dueEnd === nextRange.dueEnd) {
      return { anchorDate: nextRange.dueStart, anchorKind: 'start', kind: 'anchor' };
    }

    if (row.dueEnd !== nextRange.dueEnd && row.dueStart === nextRange.dueStart) {
      return { anchorDate: nextRange.dueEnd, anchorKind: 'end', kind: 'anchor' };
    }

    return {
      anchorDate: anchorKind === 'start' ? nextRange.dueStart : nextRange.dueEnd,
      anchorKind,
      kind: 'anchor',
    };
  }

  const dueStartChanged = row.dueStart !== nextRange.dueStart;
  const dueEndChanged = row.dueEnd !== nextRange.dueEnd;

  if (row.level === 'stage') {
    return {
      kind: 'stages',
      stages: stages.map((stage) =>
        stage.stage === row.entityId
          ? {
              ...stage,
              dueEnd: nextRange.dueEnd,
              dueEndSetManually: dueEndChanged ? true : stage.dueEndSetManually,
              dueStart: nextRange.dueStart,
              dueStartSetManually: dueStartChanged ? true : stage.dueStartSetManually,
              stationBookings: stage.stationBookings.map((booking) => ({
                ...booking,
                dueEnd: dueEndChanged && !booking.dueEndSetManually ? nextRange.dueEnd : booking.dueEnd,
                dueStart: dueStartChanged && !booking.dueStartSetManually ? nextRange.dueStart : booking.dueStart,
              })),
            }
          : stage,
      ),
    };
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
