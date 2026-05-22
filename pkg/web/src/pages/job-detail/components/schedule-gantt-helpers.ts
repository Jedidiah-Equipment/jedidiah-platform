import { jobStageStatusLabels } from '@pkg/domain';
import type { JobDetail, JobStageRollup, StationBooking } from '@pkg/schema';
import { addDays, differenceInCalendarDays, format, isBefore, isValid, parse, startOfDay } from 'date-fns';

import { formatDate, parseDate } from '@/utils/date.js';

import { stageLabels } from '../constants.js';

export type ScheduleGanttRow = {
  actualEnd: string | null;
  actualStart: string | null;
  dueEnd: string | null;
  dueStart: string | null;
  entityId: string;
  id: string;
  level: 'job' | 'stage' | 'station';
  parentId: string | null;
  statusLabel: string;
  title: string;
};

export type DueDragAction = 'move' | 'resize-end' | 'resize-start';

export type OptimisticDueRange = {
  dueEnd: string;
  dueStart: string;
};

type DueDateEdit = {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  field: 'due_end' | 'due_start';
  value: string;
};

export type ActualDateEdit = {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  field: 'actual_end' | 'actual_start';
  value: string;
};

type DueDateFields = {
  dueEnd: string | null;
  dueStart: string | null;
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
    actualEnd: job.actualEnd,
    actualStart: job.actualStart,
    dueEnd: job.dueEnd,
    dueStart: job.dueStart,
    entityId: job.id,
    id: `job-${job.id}`,
    level: 'job',
    parentId: null,
    statusLabel: 'Job',
    title: job.code,
  };
}

function createStageRow(stage: JobStageRollup): ScheduleGanttRow {
  return {
    actualEnd: stage.actualEnd,
    actualStart: stage.actualStart,
    dueEnd: stage.dueEnd,
    dueStart: stage.dueStart,
    entityId: stage.id,
    id: `stage-${stage.id}`,
    level: 'stage',
    parentId: null,
    statusLabel: jobStageStatusLabels[stage.state],
    title: stageLabels[stage.stage],
  };
}

function createStationRow(stage: JobStageRollup, station: StationBooking): ScheduleGanttRow {
  return {
    actualEnd: station.actualEnd,
    actualStart: station.actualStart,
    dueEnd: station.dueEnd,
    dueStart: station.dueStart,
    entityId: station.id,
    id: `station-${station.id}`,
    level: 'station',
    parentId: `stage-${stage.id}`,
    statusLabel: jobStageStatusLabels[station.state],
    title: station.station.name,
  };
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

export function getScheduleGanttDueDisplay(
  row: DueDateFields,
):
  | { kind: 'none' }
  | { date: Date; kind: 'milestone'; label: string }
  | { end: Date; kind: 'range'; label: string; start: Date } {
  const start = parseScheduleDate(row.dueStart);
  const end = parseScheduleDate(row.dueEnd);

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
      label: start ? `Due start ${formatDate(start, 'short')}` : `Due end ${formatDate(date, 'short')}`,
    };
  }

  return {
    end: addDays(end, 1),
    kind: 'range',
    label: `Due ${formatDate(start, 'short')} to ${formatDate(end, 'short')}`,
    start,
  };
}

export function getScheduleGanttDueRangeAfterDrag({
  action,
  dayDelta,
  dueEnd,
  dueStart,
}: {
  action: DueDragAction;
  dayDelta: number;
  dueEnd: string | null;
  dueStart: string | null;
}): OptimisticDueRange | null {
  const start = parseScheduleDate(dueStart);
  const end = parseScheduleDate(dueEnd);
  if (!start || !end) return null;

  const nextStart = action === 'resize-end' ? start : addDays(start, dayDelta);
  const nextEnd = action === 'resize-start' ? end : addDays(end, dayDelta);
  if (isBefore(nextEnd, nextStart)) {
    return {
      dueEnd: formatDateOnly(action === 'resize-start' ? nextStart : nextEnd),
      dueStart: formatDateOnly(action === 'resize-end' ? nextEnd : nextStart),
    };
  }

  return {
    dueEnd: formatDateOnly(nextEnd),
    dueStart: formatDateOnly(nextStart),
  };
}

export function getScheduleGanttDueDateEdits({
  entityId,
  entityLevel,
  nextDueEnd,
  nextDueStart,
  previousDueEnd,
  previousDueStart,
}: {
  entityId: string;
  entityLevel: 'job' | 'stage' | 'station-booking';
  nextDueEnd: string;
  nextDueStart: string;
  previousDueEnd: string;
  previousDueStart: string;
}): DueDateEdit[] {
  const edits: DueDateEdit[] = [
    { entityId, entityLevel, field: 'due_start' as const, value: nextDueStart },
    { entityId, entityLevel, field: 'due_end' as const, value: nextDueEnd },
  ].filter((edit) => (edit.field === 'due_start' ? previousDueStart : previousDueEnd) !== edit.value);

  if (edits.length !== 2) return edits;

  const startMovesAfterPreviousEnd =
    differenceInCalendarDays(parseDateOnly(nextDueStart), parseDateOnly(previousDueEnd)) > 0;

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
    ...(nextActualEnd ? [{ entityId, entityLevel, field: 'actual_end' as const, value: nextActualEnd }] : []),
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

export function formatScheduleDateTimeInputValue(value: string | null): string {
  const date = parseDate(value);

  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

export function parseScheduleDateTimeInputValue(value: string): string | null {
  const parsedDate = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());

  return isValid(parsedDate) ? parsedDate.toISOString() : null;
}

function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function parseDateOnly(value: string): Date {
  return startOfDay(parseDate(value) ?? new Date(value));
}
