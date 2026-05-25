import type { JobDetail, JobStageName } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subYears } from 'date-fns';
import { CircleIcon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';
import { DepartmentIcon } from '@/components/departments/index.js';
import {
  GanttFeatureList,
  GanttHeader,
  GanttMarker,
  GanttProvider,
  GanttTimeline,
  GanttToday,
  getGanttOffset,
  getGanttWidth,
  useGanttContext,
} from '@/components/kibo-ui/gantt/index.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import {
  addReadOnlyJobsToScheduleGanttRows,
  buildScheduleGanttGlobalRows,
  buildScheduleGanttRows,
  getScheduleGanttActualDateEdits,
  getScheduleGanttActualDisplay,
  getScheduleGanttActualRangeAfterDrag,
  getScheduleGanttBarLabel,
  getScheduleGanttHoverCardModel,
  getScheduleGanttPlannedDateEdits,
  getScheduleGanttPlannedDisplay,
  getScheduleGanttPlannedRangeAfterDrag,
  getScheduleGanttTimelineDayCount,
  type OptimisticActualRange,
  type OptimisticPlannedRange,
  type PlannedDragAction,
  parseScheduleDate,
  type ScheduleGanttBarItem,
  type ScheduleGanttHealth,
  type ScheduleGanttHoverCardModel,
  type ScheduleGanttRow,
  type ScheduleGanttStationBooking,
} from './schedule-gantt-helpers.js';

export type ScheduleGanttInitialDateAlignment = 'center' | 'end' | 'start';

type ScheduleGanttBaseProps = {
  canEditSchedule: boolean;
  initialDate: Date;
  initialDateAlignment: ScheduleGanttInitialDateAlignment;
};

type ScheduleGanttPlannedEditHandler = (row: ScheduleGanttStationBooking, nextRange: OptimisticPlannedRange) => void;

type ScheduleGanttActualEditHandler = (
  row: ScheduleGanttStationBooking,
  nextRange: { actualEnd: string | null; actualStart: string },
) => void;

type ScheduleGanttProps =
  | (ScheduleGanttBaseProps & {
      job: JobDetail;
      mode: 'job';
    })
  | (ScheduleGanttBaseProps & {
      mode: 'create';
      onEditPlannedRange: ScheduleGanttPlannedEditHandler;
      rows: ScheduleGanttRow[];
    })
  | (ScheduleGanttBaseProps & {
      mode: 'global';
    });

const SIDEBAR_WIDTH = 300;
const ROW_HEIGHT = 42;
const STATION_LANE_HEIGHT = 72;
const STATION_ROW_PADDING = 6;
const STATION_ACTUAL_OFFSET = 18;
const PLANNED_BAR_HEIGHT = 48;
const ACTUAL_LINE_HEIGHT = 4;
const GANTT_SCROLLBAR_GUTTER = 18;

const SCHEDULE_HEALTH_CLASSES = {
  Late: 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-200',
  'Not started': 'border-muted-foreground/40 bg-muted text-muted-foreground',
  'On time': 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  'On track': 'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  Overdue: 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-200',
  Unplanned: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-200',
} as const satisfies Record<ScheduleGanttHealth, string>;
const PLANNED_BAR_CLASSES_BY_STAGE = {
  procurement:
    'border-violet-500/45 bg-violet-500/5 text-violet-700 shadow-[inset_0_0_0_1px_rgb(139_92_246_/_0.08)] before:bg-violet-500/80 hover:border-violet-500/90 hover:bg-violet-500/10 focus-visible:border-violet-500/90 focus-visible:bg-violet-500/10 dark:text-violet-200',
  supply:
    'border-amber-500/45 bg-amber-500/5 text-amber-800 shadow-[inset_0_0_0_1px_rgb(245_158_11_/_0.08)] before:bg-amber-500/80 hover:border-amber-500/90 hover:bg-amber-500/10 focus-visible:border-amber-500/90 focus-visible:bg-amber-500/10 dark:text-amber-200',
  fabrication:
    'border-cyan-500/45 bg-cyan-500/5 text-cyan-800 shadow-[inset_0_0_0_1px_rgb(6_182_212_/_0.08)] before:bg-cyan-500/80 hover:border-cyan-500/90 hover:bg-cyan-500/10 focus-visible:border-cyan-500/90 focus-visible:bg-cyan-500/10 dark:text-cyan-200',
  paint:
    'border-rose-500/45 bg-rose-500/5 text-rose-800 shadow-[inset_0_0_0_1px_rgb(244_63_94_/_0.08)] before:bg-rose-500/80 hover:border-rose-500/90 hover:bg-rose-500/10 focus-visible:border-rose-500/90 focus-visible:bg-rose-500/10 dark:text-rose-200',
  assembly:
    'border-teal-500/45 bg-teal-500/5 text-teal-800 shadow-[inset_0_0_0_1px_rgb(20_184_166_/_0.08)] before:bg-teal-500/80 hover:border-teal-500/90 hover:bg-teal-500/10 focus-visible:border-teal-500/90 focus-visible:bg-teal-500/10 dark:text-teal-200',
} as const satisfies Record<JobStageName, string>;

function getScheduleGanttRowHeight(row: ScheduleGanttRow): number {
  if (row.level !== 'stage') return ROW_HEIGHT;

  const laneCount =
    row.stationBookings.reduce(
      (maxLaneIndex, stationBooking, index) => Math.max(maxLaneIndex, stationBooking.laneIndex ?? index),
      -1,
    ) + 1;

  return Math.max(ROW_HEIGHT, STATION_ROW_PADDING * 2 + laneCount * STATION_LANE_HEIGHT);
}

function getStationLaneTopOffset(row: ScheduleGanttRow, laneIndex: number): number {
  const laneCenter = STATION_ROW_PADDING + STATION_LANE_HEIGHT * laneIndex + STATION_LANE_HEIGHT / 2;

  return laneCenter - getScheduleGanttRowHeight(row) / 2;
}

function isScheduleGanttActualPastPlannedEnd(row: ScheduleGanttBarItem, now = new Date()): boolean {
  const plannedEnd = parseScheduleDate(row.plannedEnd);
  if (!plannedEnd) return false;

  const actualEnd = parseScheduleDate(row.actualEnd);
  const actualComparisonDate = actualEnd ?? parseScheduleDate(now.toISOString());

  return actualComparisonDate ? actualComparisonDate.getTime() > plannedEnd.getTime() : false;
}

function getScheduleGanttActualClassName(row: ScheduleGanttBarItem): string {
  if (isScheduleGanttActualPastPlannedEnd(row)) return 'bg-red-600 text-white';

  return row.actualEnd ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white';
}

function getScheduleGanttPlannedClassName(row: ScheduleGanttBarItem): string {
  if (row.level === 'station' && row.barKind === 'job') {
    return 'border-sky-500/70 bg-sky-500/10 text-sky-700 shadow-[inset_0_0_0_1px_rgb(14_165_233_/_0.12)] dark:text-sky-300';
  }

  if (row.level === 'station') return PLANNED_BAR_CLASSES_BY_STAGE[row.stage];

  return 'border-sky-500/70 bg-sky-500/10 text-sky-700 shadow-[inset_0_0_0_1px_rgb(14_165_233_/_0.12)] dark:text-sky-300';
}

export const ScheduleGantt: React.FC<ScheduleGanttProps> = (props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();

  const mode = props.mode;
  const job = props.mode === 'create' || props.mode === 'global' ? null : props.job;

  const createRows = props.mode === 'create' ? props.rows : null;

  const [scheduleEditCompletionKey, setScheduleEditCompletionKey] = React.useState(0);
  const [optimisticActualRanges, setOptimisticActualRanges] = React.useState<Record<string, OptimisticActualRange>>({});
  const [optimisticPlannedRanges, setOptimisticPlannedRanges] = React.useState<Record<string, OptimisticPlannedRange>>(
    {},
  );

  const jobDueDate = parseScheduleDate(job?.dueDate ?? null);

  const globalInitialDate = React.useMemo(() => new Date(), []);
  const ganttCreatedAtStart = React.useMemo(() => subYears(globalInitialDate, 1).toISOString(), [globalInitialDate]);

  const initialDate = props.initialDate;
  const initialDateAlignment = props.initialDateAlignment;
  const initialScrollKey = `${mode}-${initialDateAlignment}-${initialDate.toISOString()}`;

  const scheduleJobsQuery = useQuery({
    ...trpc.jobs.list.queryOptions({
      filters: {
        createdAtStart: ganttCreatedAtStart,
        statuses: ['pending', 'active', 'paused', 'complete'],
      },
      page: 1,
      pageSize: 0,
      search: '',
      sortBy: 'createdAt',
      sortDirection: 'asc',
    }),
  });

  const scheduleJobs = React.useMemo(
    () =>
      job
        ? (scheduleJobsQuery.data?.items ?? []).filter((scheduleJob) => scheduleJob.id !== job.id)
        : (scheduleJobsQuery.data?.items ?? []),
    [job, scheduleJobsQuery.data?.items],
  );

  const editDateMutation = useMutation(
    trpc.jobs.editStationDate.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to update schedule date.'),
    }),
  );

  const rows = React.useMemo(() => {
    const sourceRows: ScheduleGanttRow[] =
      createRows !== null
        ? addReadOnlyJobsToScheduleGanttRows(createRows, scheduleJobs)
        : job
          ? buildScheduleGanttRows(job, scheduleJobs)
          : buildScheduleGanttGlobalRows(scheduleJobs);

    return sourceRows.map((row) => {
      const optimisticActualRange = optimisticActualRanges[row.id];
      const optimisticPlannedRange = optimisticPlannedRanges[row.id];
      const stationBookings = row.stationBookings.map((stationBooking) => {
        const stationOptimisticActualRange = optimisticActualRanges[stationBooking.id];
        const stationOptimisticPlannedRange = optimisticPlannedRanges[stationBooking.id];

        return {
          ...stationBooking,
          ...stationOptimisticPlannedRange,
          ...stationOptimisticActualRange,
        };
      });

      return {
        ...row,
        ...optimisticPlannedRange,
        ...optimisticActualRange,
        stationBookings,
      };
    });
  }, [createRows, job, optimisticActualRanges, optimisticPlannedRanges, scheduleJobs]);

  const ganttHeight = Math.max(
    420,
    60 + rows.reduce((total, row) => total + getScheduleGanttRowHeight(row), 0) + GANTT_SCROLLBAR_GUTTER,
  );

  const editPlannedRange = async (row: ScheduleGanttStationBooking, nextRange: OptimisticPlannedRange) => {
    if (!row.plannedStart || !row.plannedEnd) return;

    if (props.mode === 'create') {
      props.onEditPlannedRange(row, nextRange);
      return;
    }
    if (props.mode !== 'job') return;

    setOptimisticPlannedRanges((current) => ({ ...current, [row.id]: nextRange }));

    let attemptedEdit = false;
    try {
      for (const edit of getScheduleGanttPlannedDateEdits({
        jobId: props.job.id,
        nextPlannedEnd: nextRange.plannedEnd,
        nextPlannedStart: nextRange.plannedStart,
        previousPlannedEnd: row.plannedEnd,
        previousPlannedStart: row.plannedStart,
        stationName: row.title,
      })) {
        attemptedEdit = true;
        await editDateMutation.mutateAsync(edit);
      }
      await queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
      toast.success('Schedule updated');
    } catch {
      if (attemptedEdit) {
        await queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
      }
    } finally {
      setOptimisticPlannedRanges((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setScheduleEditCompletionKey((current) => current + 1);
    }
  };

  const editActualDates = async (
    row: ScheduleGanttStationBooking,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => {
    if (!row.actualStart) return;
    if (props.mode !== 'job') return;

    setOptimisticActualRanges((current) => ({ ...current, [row.id]: nextRange }));

    let attemptedEdit = false;
    try {
      for (const edit of getScheduleGanttActualDateEdits({
        jobId: props.job.id,
        nextActualEnd: nextRange.actualEnd,
        nextActualStart: nextRange.actualStart,
        previousActualEnd: row.actualEnd,
        previousActualStart: row.actualStart,
        stationName: row.title,
      })) {
        attemptedEdit = true;
        await editDateMutation.mutateAsync(edit);
      }
      await queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
      if (attemptedEdit) {
        toast.success('Actual dates updated');
      }
    } catch {
      if (attemptedEdit) {
        await queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
      }
    } finally {
      setOptimisticActualRanges((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setScheduleEditCompletionKey((current) => current + 1);
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Planned windows and actual progress by Job, Department, and Station.
          </p>
        </div>
      </div>
      <div className="min-w-0 overflow-hidden" style={{ height: ganttHeight }}>
        <GanttProvider
          key={initialScrollKey}
          className="min-w-0 rounded-md border bg-background"
          initialDate={initialDate}
          initialDateAlignment={initialDateAlignment}
          range="daily"
          zoom={70}
        >
          <ScheduleGanttSidebar rows={rows} />
          <GanttTimeline>
            <GanttHeader />
            {jobDueDate ? (
              <GanttMarker
                className="border-red-700 bg-red-600 text-white"
                date={jobDueDate}
                id={`job-planned-date-${job?.id ?? ''}`}
                label="Job Due Date"
              />
            ) : null}
            <GanttFeatureList className="absolute top-0 left-0 w-max space-y-0">
              {rows.map((row) => (
                <ScheduleGanttTimelineRow
                  canEditActualBars={props.canEditSchedule && !editDateMutation.isPending}
                  canEditPlannedBars={props.canEditSchedule && !editDateMutation.isPending}
                  key={row.id}
                  onEditActualDates={editActualDates}
                  onEditPlannedRange={editPlannedRange}
                  previewResetVersion={scheduleEditCompletionKey}
                  row={row}
                />
              ))}
              <GanttToday className="bg-primary text-primary-foreground" />
            </GanttFeatureList>
          </GanttTimeline>
        </GanttProvider>
      </div>
    </section>
  );
};

const ScheduleGanttSidebar: React.FC<{
  rows: ScheduleGanttRow[];
}> = ({ rows }) => (
  <div
    className="sticky left-0 z-30 h-max min-h-full overflow-clip border-r bg-background/95 backdrop-blur"
    data-roadmap-ui="gantt-sidebar"
    style={{ width: SIDEBAR_WIDTH }}
  >
    <div
      className="sticky top-0 z-10 flex items-end justify-between border-b bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur"
      style={{ height: 'var(--gantt-header-height)' }}
    >
      <span>Schedule row</span>
      <span>Status</span>
    </div>
    {rows.map((row) => {
      return (
        <div
          className={cn(
            'flex items-center gap-2 border-b px-3 text-xs',
            row.level === 'job' && 'bg-muted/50 font-medium',
          )}
          key={row.id}
          style={{ height: getScheduleGanttRowHeight(row) }}
        >
          <span className="flex size-8 shrink-0 items-center justify-center">
            <CircleIcon className={cn('text-muted-foreground', row.level === 'stage' && 'size-2 fill-current')} />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{row.title}</span>
          <span className="shrink-0 text-muted-foreground">{row.statusLabel}</span>
        </div>
      );
    })}
  </div>
);

const ScheduleGanttTimelineRow: React.FC<{
  canEditActualBars: boolean;
  canEditPlannedBars: boolean;
  onEditActualDates: ScheduleGanttActualEditHandler;
  onEditPlannedRange: ScheduleGanttPlannedEditHandler;
  previewResetVersion: number;
  row: ScheduleGanttRow;
}> = ({ canEditActualBars, canEditPlannedBars, onEditActualDates, onEditPlannedRange, previewResetVersion, row }) => (
  <ScheduleGanttTimelineRowInner
    canEditActualBars={canEditActualBars}
    canEditPlannedBars={canEditPlannedBars}
    onEditActualDates={onEditActualDates}
    onEditPlannedRange={onEditPlannedRange}
    previewResetVersion={previewResetVersion}
    row={row}
  />
);

const ScheduleGanttTimelineRowInner: React.FC<{
  canEditActualBars: boolean;
  canEditPlannedBars: boolean;
  onEditActualDates: ScheduleGanttActualEditHandler;
  onEditPlannedRange: ScheduleGanttPlannedEditHandler;
  previewResetVersion: number;
  row: ScheduleGanttRow;
}> = ({ canEditActualBars, canEditPlannedBars, onEditActualDates, onEditPlannedRange, previewResetVersion, row }) => {
  const gantt = useGanttContext();
  const dayCount = getScheduleGanttTimelineDayCount(gantt.timelineData);

  return (
    <div
      className={cn('relative border-b', row.level === 'job' && 'bg-muted/20')}
      style={{ height: getScheduleGanttRowHeight(row), width: `calc(var(--gantt-column-width) * ${dayCount})` }}
    >
      {row.level === 'job' ? (
        <>
          <ScheduleGanttPlannedRange canEdit={false} onEdit={onEditPlannedRange} row={row} />
          <ScheduleGanttActualRange
            canEdit={false}
            onEdit={onEditActualDates}
            previewResetVersion={previewResetVersion}
            row={row}
          />
        </>
      ) : (
        <ScheduleGanttStationLanes
          canEditActualBars={canEditActualBars}
          canEditPlannedBars={canEditPlannedBars}
          onEditActualDates={onEditActualDates}
          onEditPlannedRange={onEditPlannedRange}
          previewResetVersion={previewResetVersion}
          row={row}
        />
      )}
    </div>
  );
};

const ScheduleGanttStationLanes: React.FC<{
  canEditActualBars: boolean;
  canEditPlannedBars: boolean;
  onEditActualDates: ScheduleGanttActualEditHandler;
  onEditPlannedRange: ScheduleGanttPlannedEditHandler;
  previewResetVersion: number;
  row: ScheduleGanttRow;
}> = ({ canEditActualBars, canEditPlannedBars, onEditActualDates, onEditPlannedRange, previewResetVersion, row }) => (
  <>
    {row.stationBookings.map((stationBooking, laneIndex) => (
      <ScheduleGanttStationLane
        canEditActualBars={canEditActualBars}
        canEditPlannedBars={canEditPlannedBars}
        key={stationBooking.id}
        laneIndex={stationBooking.laneIndex ?? laneIndex}
        onEditActualDates={onEditActualDates}
        onEditPlannedRange={onEditPlannedRange}
        previewResetVersion={previewResetVersion}
        row={row}
        stationBooking={stationBooking}
      />
    ))}
  </>
);

const ScheduleGanttStationLane: React.FC<{
  canEditActualBars: boolean;
  canEditPlannedBars: boolean;
  laneIndex: number;
  onEditActualDates: ScheduleGanttActualEditHandler;
  onEditPlannedRange: ScheduleGanttPlannedEditHandler;
  previewResetVersion: number;
  row: ScheduleGanttRow;
  stationBooking: ScheduleGanttStationBooking;
}> = ({
  canEditActualBars,
  canEditPlannedBars,
  laneIndex,
  onEditActualDates,
  onEditPlannedRange,
  previewResetVersion,
  row,
  stationBooking,
}) => {
  const topOffset = getStationLaneTopOffset(row, laneIndex);
  const stationLabel = stationBooking.title;

  return (
    <>
      <ScheduleGanttPlannedRange
        canEdit={canEditPlannedBars}
        onEdit={onEditPlannedRange}
        previewResetVersion={previewResetVersion}
        readOnly={stationBooking.readOnly ?? false}
        row={stationBooking}
        topOffset={topOffset}
        visibleLabel={stationLabel}
      />
      <ScheduleGanttActualRange
        canEdit={canEditActualBars}
        onEdit={onEditActualDates}
        previewResetVersion={previewResetVersion}
        readOnly={stationBooking.readOnly ?? false}
        row={stationBooking}
        topOffset={topOffset + STATION_ACTUAL_OFFSET}
      />
    </>
  );
};

const ScheduleGanttPlannedRange: React.FC<{
  canEdit: boolean;
  onEdit: ScheduleGanttPlannedEditHandler;
  previewResetVersion?: number;
  row: ScheduleGanttBarItem;
  readOnly?: boolean;
  topOffset?: number;
  visibleLabel?: string | undefined;
}> = ({ canEdit, onEdit, previewResetVersion, readOnly = false, row, topOffset = 0, visibleLabel }) => {
  const planned = getScheduleGanttPlannedDisplay(row);

  if (planned.kind === 'none') {
    return null;
  }

  if (planned.kind === 'milestone') {
    return (
      <ScheduleGanttMilestone
        date={planned.date}
        hoverCard={getScheduleGanttHoverCardModel(row)}
        label={getScheduleGanttBarLabel(row, planned.label)}
        readOnly={readOnly}
        topOffset={topOffset}
      />
    );
  }

  return (
    <ScheduleGanttBar
      className={cn(
        'border bg-background/80',
        row.level === 'station' &&
          row.barKind !== 'job' &&
          'before:absolute before:top-0 before:left-0 before:h-full before:w-1 before:content-[""]',
        getScheduleGanttPlannedClassName(row),
        row.level === 'job' && 'bg-sky-500/50',
      )}
      editable={canEdit && !readOnly && row.level === 'station'}
      height={row.level === 'job' ? 4 : PLANNED_BAR_HEIGHT}
      hoverCard={getScheduleGanttHoverCardModel(row)}
      key={`planned-${row.id}-${previewResetVersion ?? 0}`}
      onEdit={(action, dayDelta) => {
        const nextRange = getScheduleGanttPlannedRangeAfterDrag({
          action,
          dayDelta,
          plannedEnd: row.plannedEnd,
          plannedStart: row.plannedStart,
        });
        if (!nextRange || (nextRange.plannedEnd === row.plannedEnd && nextRange.plannedStart === row.plannedStart)) {
          return false;
        }
        if (row.level !== 'station') return false;
        onEdit(row, nextRange);
        return true;
      }}
      end={planned.end}
      label={getScheduleGanttBarLabel(row, planned.label)}
      readOnly={readOnly}
      start={planned.start}
      topOffset={topOffset}
      visibleLabel={visibleLabel}
      visibleLabelDepartment={row.level === 'station' && row.barKind !== 'job' ? row.stage : undefined}
      showEditHandles={row.level === 'station'}
    />
  );
};

const ScheduleGanttActualRange: React.FC<{
  canEdit: boolean;
  onEdit: ScheduleGanttActualEditHandler;
  previewResetVersion?: number;
  row: ScheduleGanttBarItem;
  readOnly?: boolean;
  topOffset?: number;
  visibleLabel?: string | undefined;
}> = ({ canEdit, onEdit, previewResetVersion, readOnly = false, row, topOffset = 0, visibleLabel }) => {
  const actual = getScheduleGanttActualDisplay(row);

  if (actual.kind === 'none') {
    return null;
  }

  if (canEdit && !readOnly && row.level === 'station' && row.actualStart) {
    return (
      <ScheduleGanttBar
        className={cn('z-20 shadow-sm', getScheduleGanttActualClassName(row), actual.openEnded && 'rounded-r-none')}
        editable
        end={actual.end}
        height={ACTUAL_LINE_HEIGHT}
        hoverCard={getScheduleGanttHoverCardModel(row)}
        key={`actual-${row.id}-${previewResetVersion ?? 0}`}
        label={getScheduleGanttBarLabel(row, actual.label)}
        onEdit={(action, _dayDelta, millisecondDelta) => {
          const nextRange = getScheduleGanttActualRangeAfterDrag({
            action,
            actualEnd: row.actualEnd,
            actualStart: row.actualStart,
            millisecondDelta,
          });
          if (!nextRange || (nextRange.actualEnd === row.actualEnd && nextRange.actualStart === row.actualStart)) {
            return false;
          }
          onEdit(row, nextRange);
          return true;
        }}
        start={actual.start}
        topOffset={topOffset}
        visibleLabel={visibleLabel}
      />
    );
  }

  return (
    <ScheduleGanttBar
      className={cn('z-20 shadow-sm', getScheduleGanttActualClassName(row), actual.openEnded && 'rounded-r-none')}
      end={actual.end}
      height={ACTUAL_LINE_HEIGHT}
      hoverCard={getScheduleGanttHoverCardModel(row)}
      key={`actual-${row.id}-${previewResetVersion ?? 0}`}
      label={getScheduleGanttBarLabel(row, actual.label)}
      readOnly={readOnly}
      start={actual.start}
      topOffset={topOffset}
      visibleLabel={visibleLabel}
    />
  );
};

const ScheduleGanttBar: React.FC<{
  className: string;
  editable?: boolean;
  end: Date;
  height?: number;
  hoverCard?: ScheduleGanttHoverCardModel | undefined;
  label: string;
  onEdit?: (action: PlannedDragAction, dayDelta: number, millisecondDelta: number) => boolean;
  readOnly?: boolean;
  showEditHandles?: boolean;
  start: Date;
  topOffset?: number;
  visibleLabelDepartment?: JobStageName | undefined;
  visibleLabel?: string | undefined;
}> = ({
  className,
  editable = false,
  end,
  height = 16,
  hoverCard,
  label,
  onEdit,
  readOnly = false,
  showEditHandles = false,
  start,
  topOffset = 0,
  visibleLabelDepartment,
  visibleLabel,
}) => {
  const gantt = useGanttContext();
  const dragStartRef = React.useRef<{ action: PlannedDragAction; pointerX: number } | null>(null);
  const [dragPreview, setDragPreview] = React.useState<{ action: PlannedDragAction; pixelDelta: number } | null>(null);
  const [committedPreview, setCommittedPreview] = React.useState<{
    left: number;
    sourceEndTime: number;
    sourceStartTime: number;
    width: number;
  } | null>(null);
  const renderedColumnWidth = (gantt.columnWidth * gantt.zoom) / 100;
  const left = getGanttOffset(start, gantt);
  const width = getGanttWidth(start, end, gantt);
  React.useEffect(() => {
    if (
      committedPreview &&
      (committedPreview.sourceStartTime !== start.getTime() || committedPreview.sourceEndTime !== end.getTime())
    ) {
      setCommittedPreview(null);
    }
  }, [committedPreview, end, start]);
  const previewLeft =
    dragPreview?.action === 'move'
      ? left + dragPreview.pixelDelta
      : dragPreview?.action === 'resize-start'
        ? left + Math.min(dragPreview.pixelDelta, width - 10)
        : (committedPreview?.left ?? left);
  const previewWidth =
    dragPreview?.action === 'resize-start'
      ? Math.max(width - dragPreview.pixelDelta, 10)
      : dragPreview?.action === 'resize-end'
        ? Math.max(width + dragPreview.pixelDelta, 10)
        : (committedPreview?.width ?? width);
  const commitDrag = React.useCallback(
    (event: React.PointerEvent<Element>) => {
      const dragStart = dragStartRef.current;
      dragStartRef.current = null;
      setDragPreview(null);
      if (!dragStart || !onEdit) return;

      const pixelDelta = event.clientX - dragStart.pointerX;
      const dayDelta = Math.round(pixelDelta / renderedColumnWidth);
      const millisecondDelta = Math.round((pixelDelta / renderedColumnWidth) * 24 * 60 * 60 * 1000);
      if (dayDelta !== 0 || millisecondDelta !== 0) {
        const didEdit = onEdit(dragStart.action, dayDelta, millisecondDelta);
        if (!didEdit) return;

        const nextLeft =
          dragStart.action === 'move'
            ? left + pixelDelta
            : dragStart.action === 'resize-start'
              ? left + Math.min(pixelDelta, width - 10)
              : left;
        const nextWidth =
          dragStart.action === 'resize-start'
            ? Math.max(width - pixelDelta, 10)
            : dragStart.action === 'resize-end'
              ? Math.max(width + pixelDelta, 10)
              : width;

        setCommittedPreview({
          left: nextLeft,
          sourceEndTime: end.getTime(),
          sourceStartTime: start.getTime(),
          width: nextWidth,
        });
      }
    },
    [end, left, onEdit, renderedColumnWidth, start, width],
  );
  const startDrag = React.useCallback((event: React.PointerEvent<Element>, action: PlannedDragAction) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { action, pointerX: event.clientX };
    setCommittedPreview(null);
    setDragPreview({ action, pixelDelta: 0 });
  }, []);
  const previewDrag = React.useCallback((event: React.PointerEvent<Element>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;

    setDragPreview({ action: dragStart.action, pixelDelta: event.clientX - dragStart.pointerX });
  }, []);
  const cancelDrag = React.useCallback(() => {
    dragStartRef.current = null;
    setDragPreview(null);
    setCommittedPreview(null);
  }, []);
  const wrapWithHoverCard = (element: React.ReactElement) =>
    hoverCard ? (
      <ScheduleGanttBarHoverCard card={hoverCard} disabled={dragPreview !== null} trigger={element} />
    ) : (
      element
    );

  const barClassName = cn(
    className,
    readOnly &&
      'border border-muted-foreground/40 bg-muted-foreground/15 text-muted-foreground shadow-sm ring-1 ring-muted-foreground/30 before:bg-muted-foreground/70 hover:border-muted-foreground/60 hover:bg-muted-foreground/20 focus-visible:border-muted-foreground/60 focus-visible:bg-muted-foreground/20',
  );

  if (!editable || readOnly) {
    return wrapWithHoverCard(
      <div
        aria-label={label}
        className={cn('absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-sm', barClassName)}
        role="img"
        style={{
          height,
          left: Math.round(left),
          top: `calc(50% + ${topOffset}px)`,
          width: Math.max(Math.round(width), 10),
        }}
        title={hoverCard ? undefined : label}
      >
        {visibleLabel ? (
          <span className="absolute top-1 left-2 right-2 flex min-w-0 items-center gap-1.5 text-left text-xs font-medium leading-4">
            {visibleLabelDepartment ? (
              <DepartmentIcon className="size-3.5 shrink-0" department={visibleLabelDepartment} />
            ) : null}
            <span className="min-w-0 truncate">{visibleLabel}</span>
          </span>
        ) : null}
      </div>,
    );
  }

  return wrapWithHoverCard(
    <button
      aria-label={`${label}; drag to move, drag either edge to resize`}
      className={cn(
        'group absolute top-1/2 -translate-y-1/2 cursor-grab appearance-none overflow-hidden rounded-sm p-0 transition-colors',
        barClassName,
      )}
      onPointerCancel={cancelDrag}
      onPointerDown={(event) => startDrag(event, 'move')}
      onPointerMove={previewDrag}
      onPointerUp={commitDrag}
      style={{
        height,
        left: Math.round(previewLeft),
        top: `calc(50% + ${topOffset}px)`,
        width: Math.max(Math.round(previewWidth), 10),
      }}
      title={hoverCard ? undefined : label}
      type="button"
    >
      {visibleLabel ? (
        <span className="absolute top-1 left-2 right-2 flex min-w-0 items-center gap-1.5 text-left text-xs font-medium leading-4">
          {visibleLabelDepartment ? (
            <DepartmentIcon className="size-3.5 shrink-0" department={visibleLabelDepartment} />
          ) : null}
          <span className="min-w-0 truncate">{visibleLabel}</span>
        </span>
      ) : null}
      <span
        className={cn(
          'absolute top-0 left-0 h-full w-2 cursor-ew-resize rounded-l-sm transition-opacity',
          showEditHandles && 'bg-foreground/20 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
        onPointerCancel={cancelDrag}
        onPointerDown={(event) => {
          event.stopPropagation();
          startDrag(event, 'resize-start');
        }}
        onPointerMove={previewDrag}
        onPointerUp={commitDrag}
      />
      <span
        className={cn(
          'absolute top-0 right-0 h-full w-2 cursor-ew-resize rounded-r-sm transition-opacity',
          showEditHandles && 'bg-foreground/20 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
        onPointerCancel={cancelDrag}
        onPointerDown={(event) => {
          event.stopPropagation();
          startDrag(event, 'resize-end');
        }}
        onPointerMove={previewDrag}
        onPointerUp={commitDrag}
      />
    </button>,
  );
};

const ScheduleGanttBarHoverCard: React.FC<{
  card: ScheduleGanttHoverCardModel;
  disabled?: boolean;
  trigger: React.ReactElement;
}> = ({ card, disabled = false, trigger }) => {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <HoverCard open={disabled ? false : open} onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}>
      <HoverCardTrigger render={trigger} />
      <HoverCardContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-3" side="top">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {card.department ? (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                  <DepartmentIcon className="size-4" department={card.department} />
                </span>
              ) : null}
              <div className="min-w-0">
                <div className="truncate font-medium">{card.title}</div>
                <div className="truncate text-xs text-muted-foreground">{card.contextLabel}</div>
              </div>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                SCHEDULE_HEALTH_CLASSES[card.scheduleHealth],
              )}
            >
              {card.scheduleHealth}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <ScheduleGanttHoverFact label="Planned" value={card.plannedRangeLabel} />
            <ScheduleGanttHoverFact label="Actual" value={card.actualRangeLabel} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ScheduleGanttHoverFact label="Planned duration" value={card.plannedDurationLabel} />
            <ScheduleGanttHoverFact label="Actual duration" value={card.actualDurationLabel} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">Workflow: {card.workflowStatusLabel}</span>
            <span className="shrink-0 font-medium">{card.varianceLabel}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const ScheduleGanttHoverFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-md border bg-background/70 p-2">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 break-words text-sm leading-snug">{value}</div>
  </div>
);

const ScheduleGanttMilestone: React.FC<{
  date: Date | null;
  hoverCard?: ScheduleGanttHoverCardModel | undefined;
  label: string;
  markerClassName?: string | undefined;
  readOnly?: boolean;
  topOffset?: number;
}> = ({ date, hoverCard, label, markerClassName, readOnly = false, topOffset = 0 }) => {
  const gantt = useGanttContext();

  if (!date) return null;

  const left = getGanttOffset(date, gantt);

  const milestone = (
    <div
      aria-label={label}
      className={cn(
        'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-sky-500 bg-background',
        markerClassName,
        readOnly && 'border-muted-foreground/60 bg-muted-foreground/20',
      )}
      role="img"
      style={{ left: Math.round(left), top: `calc(50% + ${topOffset}px)` }}
      title={hoverCard ? undefined : label}
    />
  );

  return hoverCard ? <ScheduleGanttBarHoverCard card={hoverCard} trigger={milestone} /> : milestone;
};
