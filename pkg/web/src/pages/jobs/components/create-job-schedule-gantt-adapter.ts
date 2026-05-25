import { departmentLabels } from '@pkg/domain';
import type { Station } from '@pkg/schema';

import type {
  OptimisticPlannedRange,
  ScheduleGanttRow,
  ScheduleGanttStationBooking,
} from '@/pages/job-detail/components/schedule-gantt-helpers.js';

import type { StageDraft } from './create-job-dialog-helpers.js';

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
      plannedEnd: jobWindow.plannedEnd,
      plannedStart: jobWindow.plannedStart,
      entityId: 'create-job',
      id: 'create-job',
      level: 'stage',
      parentId: null,
      stationId: null,
      stationBookings: [
        {
          actualEnd: null,
          actualStart: null,
          plannedEnd: jobWindow.plannedEnd,
          plannedStart: jobWindow.plannedStart,
          barKind: 'job',
          entityId: 'create-job',
          id: 'create-job-summary',
          laneIndex: 0,
          level: 'station',
          parentId: 'create-job',
          readOnly: true,
          stage: 'fabrication',
          stationId: 'create-job',
          statusLabel: 'Draft',
          title: 'Draft Job',
        },
      ],
      statusLabel: 'Draft',
      title: 'Draft Job',
    },
    ...stages.map((stage) => {
      const stageRowId = getCreateStageRowId(stage.stage);

      return {
        actualEnd: null,
        actualStart: null,
        ...getDraftWindow(stage.stationBookings),
        entityId: stage.stage,
        id: stageRowId,
        level: 'stage' as const,
        parentId: null,
        stationId: null,
        stationBookings: stage.stationBookings.map((booking) => ({
          actualEnd: null,
          actualStart: null,
          plannedEnd: booking.plannedEnd || null,
          plannedStart: booking.plannedStart || null,
          entityId: booking.id,
          id: getCreateStationRowId(booking.id),
          level: 'station' as const,
          parentId: stageRowId,
          stage: stage.stage,
          stationId: booking.stationId,
          statusLabel: 'Draft',
          title: stationNamesById.get(booking.stationId) ?? 'Selected Station',
        })),
        statusLabel: 'Draft',
        title: departmentLabels[stage.stage],
      };
    }),
  ];
}

export function applyCreateScheduleGanttPlannedRangeEdit({
  nextRange,
  row,
  stages,
}: {
  nextRange: OptimisticPlannedRange;
  row: ScheduleGanttStationBooking;
  stages: StageDraft[];
}): StageDraft[] {
  return stages.map((stage) => ({
    ...stage,
    stationBookings: stage.stationBookings.map((booking) =>
      booking.id === row.entityId
        ? {
            ...booking,
            plannedEnd: nextRange.plannedEnd,
            plannedStart: nextRange.plannedStart,
          }
        : booking,
    ),
  }));
}

function getCreateStageRowId(stage: string): string {
  return `create-stage-${stage}`;
}

function getCreateStationRowId(bookingId: string): string {
  return `create-station-${bookingId}`;
}

function getDraftWindow(bookings: { plannedEnd: string; plannedStart: string }[]): {
  plannedEnd: string | null;
  plannedStart: string | null;
} {
  const plannedStarts = bookings
    .map((booking) => booking.plannedStart)
    .filter((value) => value !== '')
    .sort();
  const plannedEnds = bookings
    .map((booking) => booking.plannedEnd)
    .filter((value) => value !== '')
    .sort();

  return {
    plannedEnd: plannedEnds.at(-1) ?? null,
    plannedStart: plannedStarts[0] ?? null,
  };
}
