import { jobStageStatusLabels } from '@pkg/domain';
import type { JobDetail, JobSharedStationBooking, JobStageRollup, StationBooking } from '@pkg/schema';
import { addDays, differenceInCalendarDays, format, isBefore, isValid, parse, startOfDay } from 'date-fns';

import { formatDate, parseDate } from '@/utils/date.js';

import { stageLabels } from '../constants.js';

export type ScheduleGanttRow = {
  actualEnd: string | null;
  actualStart: string | null;
  plannedEnd: string | null;
  plannedStart: string | null;
  entityId: string;
  id: string;
  level: 'job' | 'stage' | 'station';
  parentId: string | null;
  stationId: string | null;
  statusLabel: string;
  title: string;
};

export type PlannedDragAction = 'move' | 'resize-end' | 'resize-start';

export type OptimisticPlannedRange = {
  plannedEnd: string;
  plannedStart: string;
};

type PlannedDateEdit = {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  field: 'planned_end' | 'planned_start';
  value: string;
};

export type ActualDateEdit = {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  field: 'actual_end' | 'actual_start';
  value: string | null;
};

type PlannedDateFields = {
  plannedEnd: string | null;
  plannedStart: string | null;
};

type ActualDateFields = {
  actualEnd: string | null;
  actualStart: string | null;
};

export function buildScheduleGanttRows(job: JobDetail): ScheduleGanttRow[] {
  return [
    createJobRow(job),
    ...job.stages.flatMap((stage) => [
      createStageRow(stage),
      ...stage.stations.map((station) => createStationRow(stage, station)),
    ]),
  ];
}

function createJobRow(job: JobDetail): ScheduleGanttRow {
  return {
    actualEnd: job.actualWindow.end,
    actualStart: job.actualWindow.start,
    plannedEnd: toDateOnly(job.plannedWindow.end),
    plannedStart: toDateOnly(job.plannedWindow.start),
    entityId: job.id,
    id: `job-${job.id}`,
    level: 'job',
    parentId: null,
    stationId: null,
    statusLabel: 'Job',
    title: job.code,
  };
}

function createStageRow(stage: JobStageRollup): ScheduleGanttRow {
  return {
    actualEnd: stage.actualWindow.end,
    actualStart: stage.actualWindow.start,
    plannedEnd: toDateOnly(stage.plannedWindow.end),
    plannedStart: toDateOnly(stage.plannedWindow.start),
    entityId: stage.id,
    id: `stage-${stage.id}`,
    level: 'stage',
    parentId: null,
    stationId: null,
    statusLabel: jobStageStatusLabels[stage.state],
    title: stageLabels[stage.stage],
  };
}

function createStationRow(stage: JobStageRollup, station: StationBooking): ScheduleGanttRow {
  return {
    actualEnd: station.actualEnd,
    actualStart: station.actualStart,
    plannedEnd: station.plannedEnd,
    plannedStart: station.plannedStart,
    entityId: station.id,
    id: `station-${station.id}`,
    level: 'station',
    parentId: `stage-${stage.id}`,
    stationId: station.stationId,
    statusLabel: jobStageStatusLabels[station.state],
    title: station.station.name,
  };
}

function toDateOnly(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

export function parseScheduleDate(value: string | null): Date | null {
  const date = parseDate(value);

  return date ? startOfDay(date) : null;
}

export function getActualEndForDisplay(start: Date, end: Date | null, now = new Date()): Date {
  if (end) {
    return addDays(startOfDay(end), 1);
  }

  const today = startOfDay(now);

  return isBefore(today, start) ? addDays(start, 1) : addDays(today, 1);
}

export function getScheduleGanttTimelineDayCount(
  timelineData: { quarters: { months: { days: number }[] }[] }[],
): number {
  return timelineData.reduce(
    (total, year) =>
      total +
      year.quarters.reduce(
        (yearTotal, quarter) =>
          yearTotal + quarter.months.reduce((quarterTotal, month) => quarterTotal + month.days, 0),
        0,
      ),
    0,
  );
}

export function getScheduleGanttPlannedDisplay(
  row: PlannedDateFields,
):
  | { kind: 'none' }
  | { date: Date; kind: 'milestone'; label: string }
  | { end: Date; kind: 'range'; label: string; start: Date } {
  const start = parseScheduleDate(row.plannedStart);
  const end = parseScheduleDate(row.plannedEnd);

  if (!start && !end) {
    return { kind: 'none' };
  }

  if (!start || !end) {
    const date = start ?? end;

    if (!date) {
      return { kind: 'none' };
    }

    return {
      date,
      kind: 'milestone',
      label: start ? `Planned start ${formatDate(start, 'short')}` : `Planned end ${formatDate(date, 'short')}`,
    };
  }

  return {
    end: addDays(end, 1),
    kind: 'range',
    label: `Planned ${formatDate(start, 'short')} to ${formatDate(end, 'short')}`,
    start,
  };
}

export function getScheduleGanttPlannedRangeAfterDrag({
  action,
  dayDelta,
  plannedEnd,
  plannedStart,
}: {
  action: PlannedDragAction;
  dayDelta: number;
  plannedEnd: string | null;
  plannedStart: string | null;
}): OptimisticPlannedRange | null {
  const start = parseScheduleDate(plannedStart);
  const end = parseScheduleDate(plannedEnd);
  if (!start || !end) return null;

  const nextStart = action === 'resize-end' ? start : addDays(start, dayDelta);
  const nextEnd = action === 'resize-start' ? end : addDays(end, dayDelta);
  if (isBefore(nextEnd, nextStart)) {
    return {
      plannedEnd: formatDateOnly(action === 'resize-start' ? nextStart : nextEnd),
      plannedStart: formatDateOnly(action === 'resize-end' ? nextEnd : nextStart),
    };
  }

  return {
    plannedEnd: formatDateOnly(nextEnd),
    plannedStart: formatDateOnly(nextStart),
  };
}

export function getScheduleGanttActualRangeAfterDrag({
  action,
  actualEnd,
  actualStart,
  dayDelta,
}: {
  action: PlannedDragAction;
  actualEnd: string | null;
  actualStart: string | null;
  dayDelta: number;
}): { actualEnd: string | null; actualStart: string } | null {
  if (!actualStart) return null;

  const start = new Date(actualStart);
  const end = actualEnd ? new Date(actualEnd) : null;
  if (!isValid(start) || (end && !isValid(end))) return null;

  const nextStart = action === 'resize-end' ? start : addDays(start, dayDelta);
  const nextEnd = action === 'resize-start' ? end : end ? addDays(end, dayDelta) : null;
  if (nextEnd && nextStart.getTime() > nextEnd.getTime()) {
    const collapsed = action === 'resize-start' ? nextStart : nextEnd;
    return {
      actualEnd: collapsed.toISOString(),
      actualStart: collapsed.toISOString(),
    };
  }

  return {
    actualEnd: nextEnd?.toISOString() ?? null,
    actualStart: nextStart.toISOString(),
  };
}

export function getScheduleGanttPlannedDateEdits({
  entityId,
  entityLevel,
  nextPlannedEnd,
  nextPlannedStart,
  previousPlannedEnd,
  previousPlannedStart,
}: {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  nextPlannedEnd: string;
  nextPlannedStart: string;
  previousPlannedEnd: string;
  previousPlannedStart: string;
}): PlannedDateEdit[] {
  const edits: PlannedDateEdit[] = [
    { entityId, entityLevel, field: 'planned_start' as const, value: nextPlannedStart },
    { entityId, entityLevel, field: 'planned_end' as const, value: nextPlannedEnd },
  ].filter((edit) => (edit.field === 'planned_start' ? previousPlannedStart : previousPlannedEnd) !== edit.value);

  if (edits.length !== 2) return edits;

  const startMovesAfterPreviousEnd =
    differenceInCalendarDays(parseDateOnly(nextPlannedStart), parseDateOnly(previousPlannedEnd)) > 0;

  if (startMovesAfterPreviousEnd) {
    const [startEdit, endEdit] = edits;
    return endEdit && startEdit ? [endEdit, startEdit] : edits;
  }

  return edits;
}

export function getScheduleGanttActualDateEdits({
  entityId,
  entityLevel,
  nextActualEnd,
  nextActualStart,
  previousActualEnd,
  previousActualStart,
}: {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  nextActualEnd: string | null;
  nextActualStart: string;
  previousActualEnd: string | null;
  previousActualStart: string;
}): ActualDateEdit[] {
  const edits: ActualDateEdit[] = [
    { entityId, entityLevel, field: 'actual_start' as const, value: nextActualStart },
    ...(nextActualEnd !== previousActualEnd
      ? [{ entityId, entityLevel, field: 'actual_end' as const, value: nextActualEnd }]
      : []),
  ].filter((edit) => (edit.field === 'actual_start' ? previousActualStart : previousActualEnd) !== edit.value);

  if (edits.length !== 2) return edits;

  const startMovesAfterPreviousEnd =
    previousActualEnd !== null && new Date(nextActualStart).getTime() > new Date(previousActualEnd).getTime();

  if (startMovesAfterPreviousEnd) {
    const [startEdit, endEdit] = edits;
    return endEdit && startEdit ? [endEdit, startEdit] : edits;
  }

  return edits;
}

export function getScheduleGanttActualDisplay(
  row: ActualDateFields,
  now = new Date(),
): { kind: 'none' } | { end: Date; kind: 'range'; label: string; openEnded: boolean; start: Date } {
  const start = parseScheduleDate(row.actualStart);
  const end = parseScheduleDate(row.actualEnd);

  if (!start) {
    return { kind: 'none' };
  }

  return {
    end: getActualEndForDisplay(start, end, now),
    kind: 'range',
    label: end
      ? `Actual ${formatDate(start, 'short')} to ${formatDate(end, 'short')}`
      : `Actual ${formatDate(start, 'short')} through today`,
    openEnded: !end,
    start,
  };
}

export function getScheduleGanttOccupancyDisplay(
  booking: JobSharedStationBooking,
  jobCode: string,
  now = new Date(),
): { kind: 'none' } | { end: Date; kind: 'range'; label: string; openEnded: boolean; start: Date } {
  const actual = getScheduleGanttActualDisplay(booking, now);

  if (actual.kind === 'range') {
    return {
      end: actual.end,
      kind: 'range',
      label: `${jobCode} actual on ${booking.stationName}`,
      openEnded: actual.openEnded,
      start: actual.start,
    };
  }

  const plannedStart = parseScheduleDate(booking.plannedStart);
  const plannedEnd = parseScheduleDate(booking.plannedEnd);
  const start = plannedStart ?? plannedEnd;

  if (!start) {
    return { kind: 'none' };
  }

  return {
    end: addDays(plannedEnd ?? start, 1),
    kind: 'range',
    label: `${jobCode} due on ${booking.stationName}`,
    openEnded: false,
    start,
  };
}

export function formatScheduleDateTimeInputValue(value: string | null): string {
  const date = parseDate(value);

  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

export function parseScheduleDateTimeInputValue(value: string): string | null {
  const parsedDate = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());

  return isValid(parsedDate) ? parsedDate.toISOString() : null;
}

export function resolveScheduleDateTimeInputValue(value: string, previousValue: string | null): string | null {
  if (value.trim() === '') {
    return null;
  }

  if (previousValue && formatScheduleDateTimeInputValue(previousValue) === value) {
    return previousValue;
  }

  return parseScheduleDateTimeInputValue(value);
}

function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function parseDateOnly(value: string): Date {
  return startOfDay(parseDate(value) ?? new Date(value));
}
