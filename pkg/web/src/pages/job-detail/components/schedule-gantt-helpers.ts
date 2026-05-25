import { departmentLabels, JOB_STAGE_PIPELINE, jobStageStatusLabels, jobStatusLabels } from '@pkg/domain';
import type { JobDetail, JobStageName, JobStageRollup, JobStageSummary, JobSummary, StationBooking } from '@pkg/schema';
import {
  addDays,
  differenceInCalendarDays,
  differenceInMilliseconds,
  format,
  isBefore,
  isValid,
  parse,
  startOfDay,
} from 'date-fns';

import { formatDate, parseDate } from '@/utils/date.js';

import { stageLabels } from '../constants.js';

export type ScheduleGanttRow = {
  actualEnd: string | null;
  actualStart: string | null;
  plannedEnd: string | null;
  plannedStart: string | null;
  entityId: string;
  id: string;
  level: 'job' | 'stage';
  parentId: string | null;
  stationId: string | null;
  stationBookings: ScheduleGanttStationBooking[];
  statusLabel: string;
  title: string;
};

export type ScheduleGanttStationBooking = {
  actualEnd: string | null;
  actualStart: string | null;
  plannedEnd: string | null;
  plannedStart: string | null;
  entityId: string;
  id: string;
  barKind?: 'job' | 'station';
  laneIndex?: number;
  level: 'station';
  parentId: string;
  stage: JobStageName;
  stationId: string;
  readOnly?: boolean;
  statusLabel: string;
  title: string;
};

export type ScheduleGanttBarItem = ScheduleGanttRow | ScheduleGanttStationBooking;

export function getScheduleGanttBarLabel(row: ScheduleGanttBarItem, label: string): string {
  return row.level === 'station' ? `${row.title}: ${label}` : label;
}

export type ScheduleGanttHealth = 'Late' | 'Not started' | 'On time' | 'On track' | 'Overdue' | 'Unplanned';

export type ScheduleGanttHoverCardModel = {
  actualDurationLabel: string;
  actualRangeLabel: string;
  contextLabel: string;
  department: JobStageName | null;
  plannedDurationLabel: string;
  plannedRangeLabel: string;
  scheduleHealth: ScheduleGanttHealth;
  title: string;
  varianceLabel: string;
  workflowStatusLabel: string;
};

export type PlannedDragAction = 'move' | 'resize-end' | 'resize-start';

export type OptimisticPlannedRange = {
  plannedEnd: string;
  plannedStart: string;
};

export type OptimisticActualRange = {
  actualEnd: string | null;
  actualStart: string;
};

type PlannedDateEdit = {
  entityId: string;
  entityLevel: 'station-booking';
  field: 'planned_end' | 'planned_start';
  value: string;
};

export type ActualDateEdit = {
  entityId: string;
  entityLevel: 'station-booking';
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

const STATION_BOOKING_ENTITY_LEVEL = 'station-booking' as const;

export function buildScheduleGanttRows(job: JobDetail, otherJobs: JobSummary[] = []): ScheduleGanttRow[] {
  const stageRows = job.stages.map((stage) => createStageRow(stage));

  return [
    createJobsRow({
      id: 'job-summary',
      jobs: [job],
      otherJobs,
      title: 'Job',
    }),
    ...stageRows.map((row) => addReadOnlyJobStationBookings(row, otherJobs)),
  ];
}

export function addReadOnlyJobsToScheduleGanttRows(
  rows: ScheduleGanttRow[],
  otherJobs: JobSummary[],
): ScheduleGanttRow[] {
  return rows.map((row, index) => {
    const rowWithReadOnlyStationBookings = addReadOnlyJobStationBookings(row, otherJobs);
    if (index !== 0) return rowWithReadOnlyStationBookings;

    return {
      ...rowWithReadOnlyStationBookings,
      stationBookings: [
        ...rowWithReadOnlyStationBookings.stationBookings,
        ...otherJobs.map((job) => createJobSummaryBooking(job, { parentId: row.id, readOnly: true })),
      ],
    };
  });
}

export function buildScheduleGanttReadOnlyStationBooking({
  booking,
  job,
  parentId,
}: {
  booking: StationBooking;
  job: JobSummary;
  parentId: string;
}): ScheduleGanttStationBooking {
  return {
    actualEnd: booking.actualEnd,
    actualStart: booking.actualStart,
    plannedEnd: booking.plannedEnd,
    plannedStart: booking.plannedStart,
    entityId: booking.id,
    id: `readonly-station-${job.id}-${booking.id}`,
    level: 'station',
    parentId,
    readOnly: true,
    stage: getStageForStationBooking(job, booking),
    stationId: booking.stationId,
    statusLabel: jobStatusLabels[job.status],
    title: job.code,
  };
}

export function buildScheduleGanttGlobalRows(jobs: JobSummary[]): ScheduleGanttRow[] {
  const rowsByStationId = new Map<string, ScheduleGanttRow>();

  for (const job of jobs) {
    for (const stage of job.stages) {
      for (const booking of stage.stations) {
        const rowId = `global-station-${booking.stationId}`;
        const row =
          rowsByStationId.get(booking.stationId) ??
          ({
            actualEnd: null,
            actualStart: null,
            plannedEnd: null,
            plannedStart: null,
            entityId: booking.stationId,
            id: rowId,
            level: 'stage',
            parentId: null,
            stationId: booking.stationId,
            stationBookings: [],
            statusLabel: departmentLabels[stage.stage],
            title: booking.station.name,
          } satisfies ScheduleGanttRow);

        row.stationBookings.push({
          ...createJobStationBooking({ booking, job, parentId: rowId, stage: stage.stage }),
          id: `global-station-booking-${job.id}-${booking.id}`,
          parentId: rowId,
        });
        rowsByStationId.set(booking.stationId, row);
      }
    }
  }

  return [...rowsByStationId.values()]
    .map((row) => ({
      ...row,
      stationBookings: packScheduleGanttStationLanes(row.stationBookings),
    }))
    .sort(compareGlobalScheduleRows)
    .toSpliced(0, 0, createJobsRow({ id: 'global-jobs', jobs, title: 'Jobs' }));
}

export function packScheduleGanttStationLanes(
  stationBookings: ScheduleGanttStationBooking[],
): ScheduleGanttStationBooking[] {
  const laneEnds: Date[] = [];

  return [...stationBookings].sort(compareScheduleGanttStationBookingsByRange).map((booking) => {
    const range = getScheduleGanttPackingRange(booking);
    const laneIndex = range ? findPackingLaneIndex(laneEnds, range) : laneEnds.length;
    if (range) {
      laneEnds[laneIndex] = range.end;
    }

    return {
      ...booking,
      laneIndex,
    };
  });
}

function createStageRow(stage: JobStageRollup): ScheduleGanttRow {
  const stageRowId = `stage-${stage.id}`;

  return {
    actualEnd: stage.actualWindow.end,
    actualStart: stage.actualWindow.start,
    plannedEnd: toDateOnly(stage.plannedWindow.end),
    plannedStart: toDateOnly(stage.plannedWindow.start),
    entityId: stage.id,
    id: stageRowId,
    level: 'stage',
    parentId: null,
    stationId: null,
    stationBookings: [...stage.stations]
      .sort(compareStationBookingsForScheduleGantt)
      .map((station) => createStationBooking(stageRowId, stage.stage, station)),
    statusLabel: jobStageStatusLabels[stage.state],
    title: stageLabels[stage.stage],
  };
}

function createStationBooking(
  stageRowId: string,
  stage: JobStageName,
  station: StationBooking,
): ScheduleGanttStationBooking {
  return {
    actualEnd: station.actualEnd,
    actualStart: station.actualStart,
    plannedEnd: station.plannedEnd,
    plannedStart: station.plannedStart,
    entityId: station.id,
    id: `station-${station.id}`,
    level: 'station',
    parentId: stageRowId,
    stage,
    stationId: station.stationId,
    statusLabel: jobStageStatusLabels[station.state],
    title: station.station.name,
  };
}

function createJobsRow({
  id,
  jobs,
  otherJobs = [],
  title,
}: {
  id: string;
  jobs: JobSummary[];
  otherJobs?: JobSummary[];
  title: string;
}): ScheduleGanttRow {
  return {
    actualEnd: null,
    actualStart: null,
    plannedEnd: null,
    plannedStart: null,
    entityId: id,
    id,
    level: 'stage',
    parentId: null,
    stationId: null,
    stationBookings: [
      ...jobs.map((job) => createJobSummaryBooking(job, { parentId: id, readOnly: true })),
      ...otherJobs.map((job) => createJobSummaryBooking(job, { parentId: id, readOnly: true })),
    ],
    statusLabel: 'Job',
    title,
  };
}

function createJobSummaryBooking(
  job: JobSummary,
  { parentId, readOnly }: { parentId: string; readOnly: boolean },
): ScheduleGanttStationBooking {
  return {
    actualEnd: job.actualWindow.end,
    actualStart: job.actualWindow.start,
    plannedEnd: toDateOnly(job.plannedWindow.end),
    plannedStart: toDateOnly(job.plannedWindow.start),
    barKind: 'job',
    entityId: job.id,
    id: `${parentId}-job-${job.id}`,
    laneIndex: 0,
    level: 'station',
    parentId,
    readOnly,
    stage: getFirstScheduledStage(job)?.stage ?? 'fabrication',
    stationId: parentId,
    statusLabel: jobStatusLabels[job.status],
    title: job.code,
  };
}

function addReadOnlyJobStationBookings(row: ScheduleGanttRow, otherJobs: JobSummary[]): ScheduleGanttRow {
  if (row.stationBookings.length === 0) return row;

  const laneIndexesByStationId = new Map<string, number[]>();
  row.stationBookings.forEach((booking, index) => {
    const laneIndexes = laneIndexesByStationId.get(booking.stationId) ?? [];
    laneIndexes.push(booking.laneIndex ?? index);
    laneIndexesByStationId.set(booking.stationId, laneIndexes);
  });
  const nextLaneOffsetByStationId = new Map<string, number>();

  const getNextLaneIndex = (stationId: string): number => {
    const laneIndexes = laneIndexesByStationId.get(stationId);
    if (!laneIndexes || laneIndexes.length === 0) return 0;

    const nextOffset = nextLaneOffsetByStationId.get(stationId) ?? 0;
    nextLaneOffsetByStationId.set(stationId, nextOffset + 1);

    return laneIndexes[nextOffset % laneIndexes.length] ?? 0;
  };

  const readOnlyBookings = otherJobs.flatMap((job) =>
    job.stages.flatMap((stage) =>
      stage.stations
        .filter((station) => laneIndexesByStationId.has(station.stationId))
        .map((station) => ({
          ...buildScheduleGanttReadOnlyStationBooking({ booking: station, job, parentId: row.id }),
          laneIndex: getNextLaneIndex(station.stationId),
          stage: stage.stage,
        })),
    ),
  );

  return {
    ...row,
    stationBookings: [...row.stationBookings, ...readOnlyBookings],
  };
}

function createJobStationBooking({
  booking,
  job,
  parentId,
  stage,
}: {
  booking: StationBooking;
  job: JobSummary;
  parentId: string;
  stage: JobStageName;
}): ScheduleGanttStationBooking {
  return {
    actualEnd: booking.actualEnd,
    actualStart: booking.actualStart,
    plannedEnd: booking.plannedEnd,
    plannedStart: booking.plannedStart,
    entityId: booking.id,
    id: `station-${job.id}-${booking.id}`,
    level: 'station',
    parentId,
    stage,
    stationId: booking.stationId,
    statusLabel: jobStatusLabels[job.status],
    title: job.code,
  };
}

function getStageForStationBooking(job: JobSummary, booking: StationBooking): JobStageName {
  const stage = job.stages.find((jobStage) => jobStage.stations.some((station) => station.id === booking.id))?.stage;
  if (!stage) {
    throw new Error(`Station booking ${booking.id} does not belong to job ${job.id}.`);
  }

  return stage;
}

function getFirstScheduledStage(job: JobSummary): JobStageSummary | undefined {
  return job.stages.find((stage) => stage.stations.length > 0);
}

function compareStationBookingsForScheduleGantt(left: StationBooking, right: StationBooking): number {
  const displayOrder = left.station.displayOrder - right.station.displayOrder;
  if (displayOrder !== 0) return displayOrder;

  const nameOrder = left.station.name.localeCompare(right.station.name);
  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}

function compareGlobalScheduleRows(left: ScheduleGanttRow, right: ScheduleGanttRow): number {
  const leftStage = left.stationBookings[0]?.stage;
  const rightStage = right.stationBookings[0]?.stage;
  const leftStageOrder = leftStage ? getStageOrder(leftStage) : Number.MAX_SAFE_INTEGER;
  const rightStageOrder = rightStage ? getStageOrder(rightStage) : Number.MAX_SAFE_INTEGER;
  if (leftStageOrder !== rightStageOrder) return leftStageOrder - rightStageOrder;

  const titleOrder = left.title.localeCompare(right.title);
  return titleOrder === 0 ? left.id.localeCompare(right.id) : titleOrder;
}

function compareScheduleGanttStationBookingsByRange(
  left: ScheduleGanttStationBooking,
  right: ScheduleGanttStationBooking,
): number {
  const leftRange = getScheduleGanttPackingRange(left);
  const rightRange = getScheduleGanttPackingRange(right);
  const startOrder =
    (leftRange?.start.getTime() ?? Number.MAX_SAFE_INTEGER) - (rightRange?.start.getTime() ?? Number.MAX_SAFE_INTEGER);
  if (startOrder !== 0) return startOrder;

  const endOrder =
    (leftRange?.end.getTime() ?? Number.MAX_SAFE_INTEGER) - (rightRange?.end.getTime() ?? Number.MAX_SAFE_INTEGER);
  if (endOrder !== 0) return endOrder;

  const titleOrder = left.title.localeCompare(right.title);
  return titleOrder === 0 ? left.id.localeCompare(right.id) : titleOrder;
}

function findPackingLaneIndex(laneEnds: Date[], range: { end: Date; start: Date }): number {
  const reusableLaneIndex = laneEnds.findIndex((laneEnd) => laneEnd.getTime() <= range.start.getTime());

  return reusableLaneIndex === -1 ? laneEnds.length : reusableLaneIndex;
}

function getScheduleGanttPackingRange(
  booking: Pick<ScheduleGanttStationBooking, 'actualEnd' | 'actualStart' | 'plannedEnd' | 'plannedStart'>,
): { end: Date; start: Date } | null {
  const actualStart = parseDate(booking.actualStart);
  if (actualStart) {
    const actualEnd = parseDate(booking.actualEnd) ?? actualStart;
    return { end: actualEnd, start: actualStart };
  }

  const plannedStart = parseScheduleDate(booking.plannedStart);
  const plannedEnd = parseScheduleDate(booking.plannedEnd);
  const start = plannedStart ?? plannedEnd;
  if (!start) return null;

  return {
    end: addDays(plannedEnd ?? start, 1),
    start,
  };
}

function getStageOrder(stage: JobStageName): number {
  return JOB_STAGE_PIPELINE.findIndex((item) => item.stage === stage);
}

function toDateOnly(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

export function parseScheduleDate(value: string | null): Date | null {
  const date = parseDate(value);

  return date && isValid(date) ? startOfDay(date) : null;
}

export function getActualEndForDisplay(start: Date, end: Date | null, now = new Date()): Date {
  if (end) {
    return end;
  }

  return isBefore(now, start) ? start : now;
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

export function getScheduleGanttHoverCardModel(
  row: ScheduleGanttBarItem,
  now = new Date(),
): ScheduleGanttHoverCardModel {
  const plannedStart = parseScheduleDate(row.plannedStart);
  const plannedEnd = parseScheduleDate(row.plannedEnd);
  const actualStart = parseDate(row.actualStart);
  const actualEnd = parseDate(row.actualEnd);
  const actualDisplayEnd = actualStart ? getActualEndForDisplay(actualStart, actualEnd, now) : null;

  return {
    actualDurationLabel: formatActualDuration(actualStart, actualDisplayEnd),
    actualRangeLabel: formatActualRange(actualStart, actualEnd),
    contextLabel: getScheduleGanttHoverContextLabel(row),
    department: row.level === 'station' ? row.stage : null,
    plannedDurationLabel: formatPlannedDuration(plannedStart, plannedEnd),
    plannedRangeLabel: formatPlannedRange(plannedStart, plannedEnd),
    scheduleHealth: getScheduleGanttHealth({ actualEnd, actualStart, now, plannedEnd, plannedStart }),
    title: row.title,
    varianceLabel: formatScheduleVariance(plannedEnd, actualEnd ?? (actualStart ? actualDisplayEnd : null)),
    workflowStatusLabel: row.statusLabel,
  };
}

function getScheduleGanttHoverContextLabel(row: ScheduleGanttBarItem): string {
  if (row.level === 'station') return `${stageLabels[row.stage]} station`;
  if (row.level === 'job') return 'Job summary';

  return 'Department';
}

function getScheduleGanttHealth({
  actualEnd,
  actualStart,
  now,
  plannedEnd,
  plannedStart,
}: {
  actualEnd: Date | null;
  actualStart: Date | null;
  now: Date;
  plannedEnd: Date | null;
  plannedStart: Date | null;
}): ScheduleGanttHealth {
  if (!plannedStart || !plannedEnd) return 'Unplanned';

  const plannedEndBoundary = addDays(plannedEnd, 1);
  if (!actualStart) {
    return now.getTime() >= plannedEndBoundary.getTime() ? 'Overdue' : 'Not started';
  }
  if (!actualEnd) {
    return now.getTime() >= plannedEndBoundary.getTime() ? 'Overdue' : 'On track';
  }

  return actualEnd.getTime() < plannedEndBoundary.getTime() ? 'On time' : 'Late';
}

function formatPlannedRange(start: Date | null, end: Date | null): string {
  if (start && end) return formatDateRange(start, end, 'planned');
  if (start) return `Starts ${formatDate(start, 'MMM d, yyyy')}`;
  if (end) return `Ends ${formatDate(end, 'MMM d, yyyy')}`;

  return 'No planned dates';
}

function formatActualRange(start: Date | null, end: Date | null): string {
  if (start && end) return formatDateRange(start, end, 'actual');
  if (start) return `${formatDate(start, 'MMM d, HH:mm')} to In progress`;

  return 'Not started';
}

function formatDateRange(start: Date, end: Date, kind: 'actual' | 'planned'): string {
  if (kind === 'actual') {
    return start.getFullYear() === end.getFullYear()
      ? `${formatDate(start, 'MMM d, HH:mm')} to ${formatDate(end, 'MMM d, HH:mm')}`
      : `${formatDate(start, 'MMM d, yyyy HH:mm')} to ${formatDate(end, 'MMM d, yyyy HH:mm')}`;
  }

  return start.getFullYear() === end.getFullYear()
    ? `${formatDate(start, 'MMM d')} to ${formatDate(end, 'MMM d, yyyy')}`
    : `${formatDate(start, 'MMM d, yyyy')} to ${formatDate(end, 'MMM d, yyyy')}`;
}

function formatPlannedDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return 'Not planned';

  return formatDayCount(differenceInCalendarDays(end, start) + 1);
}

function formatActualDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return 'No actual time';

  return formatElapsedDuration(differenceInMilliseconds(end, start));
}

function formatScheduleVariance(plannedEnd: Date | null, comparisonEnd: Date | null): string {
  if (!plannedEnd || !comparisonEnd) return 'No variance';

  const dayDelta = differenceInCalendarDays(startOfDay(comparisonEnd), plannedEnd);
  if (dayDelta === 0) return 'On planned end date';
  if (dayDelta < 0) return `${formatDayCount(Math.abs(dayDelta))} ahead`;

  return `${formatDayCount(dayDelta)} late`;
}

function formatDayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function formatElapsedDuration(milliseconds: number): string {
  const totalMinutes = Math.max(Math.round(milliseconds / 60_000), 0);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(formatDayCount(days));
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (parts.length === 0 && minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);

  return parts.length > 0 ? parts.slice(0, 2).join(' ') : '0 minutes';
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
  millisecondDelta,
}: {
  action: PlannedDragAction;
  actualEnd: string | null;
  actualStart: string | null;
  millisecondDelta: number;
}): { actualEnd: string | null; actualStart: string } | null {
  if (!actualStart) return null;

  const start = new Date(actualStart);
  const end = actualEnd ? new Date(actualEnd) : null;
  if (!isValid(start) || (end && !isValid(end))) return null;

  const nextStart = action === 'resize-end' ? start : new Date(start.getTime() + millisecondDelta);
  const nextEnd = action === 'resize-start' ? end : end ? new Date(end.getTime() + millisecondDelta) : null;
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
  nextPlannedEnd,
  nextPlannedStart,
  previousPlannedEnd,
  previousPlannedStart,
}: {
  entityId: string;
  nextPlannedEnd: string;
  nextPlannedStart: string;
  previousPlannedEnd: string;
  previousPlannedStart: string;
}): PlannedDateEdit[] {
  const edits: PlannedDateEdit[] = [
    { entityId, entityLevel: STATION_BOOKING_ENTITY_LEVEL, field: 'planned_start' as const, value: nextPlannedStart },
    { entityId, entityLevel: STATION_BOOKING_ENTITY_LEVEL, field: 'planned_end' as const, value: nextPlannedEnd },
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
  nextActualEnd,
  nextActualStart,
  previousActualEnd,
  previousActualStart,
}: {
  entityId: string;
  nextActualEnd: string | null;
  nextActualStart: string;
  previousActualEnd: string | null;
  previousActualStart: string;
}): ActualDateEdit[] {
  const edits: ActualDateEdit[] = [
    { entityId, entityLevel: STATION_BOOKING_ENTITY_LEVEL, field: 'actual_start' as const, value: nextActualStart },
    ...(nextActualEnd !== previousActualEnd
      ? [{ entityId, entityLevel: STATION_BOOKING_ENTITY_LEVEL, field: 'actual_end' as const, value: nextActualEnd }]
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
  const start = parseDate(row.actualStart);
  const end = parseDate(row.actualEnd);

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
