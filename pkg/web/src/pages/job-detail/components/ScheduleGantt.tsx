import type { JobDetail, JobSharedStationBookingJob, JobStageName } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusinessIcon, ChevronDownIcon, CircleIcon, DiamondIcon } from 'lucide-react';
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
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import {
  buildScheduleGanttRows,
  getScheduleGanttActualDateEdits,
  getScheduleGanttActualDisplay,
  getScheduleGanttActualRangeAfterDrag,
  getScheduleGanttBarLabel,
  getScheduleGanttHoverCardModel,
  getScheduleGanttOccupancyDisplay,
  getScheduleGanttPlannedDateEdits,
  getScheduleGanttPlannedDisplay,
  getScheduleGanttPlannedRangeAfterDrag,
  getScheduleGanttTimelineDayCount,
  type OptimisticActualRange,
  type OptimisticPlannedRange,
  type PlannedDragAction,
  parseScheduleDate,
  type ScheduleGanttEditableItem,
  type ScheduleGanttHealth,
  type ScheduleGanttHoverCardModel,
  type ScheduleGanttRow,
  type ScheduleGanttStationBooking,
} from './schedule-gantt-helpers.js';

type ScheduleGanttProps =
  | {
      canEditSchedule: boolean;
      job: JobDetail;
      mode?: 'job';
    }
  | {
      canEditSchedule: boolean;
      mode: 'create';
      onEditPlannedRange: (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => void;
      rows: ScheduleGanttRow[];
    };

const SIDEBAR_WIDTH = 300;
const ROW_HEIGHT = 42;
const STATION_LANE_HEIGHT = 72;
const STATION_ROW_PADDING = 6;
const STATION_ACTUAL_OFFSET = 18;
const PLANNED_BAR_HEIGHT = 48;
const ACTUAL_LINE_HEIGHT = 4;
const EMPTY_SHARED_BOOKING_JOBS: JobSharedStationBookingJob[] = [];
const EMPTY_SELECTED_OVERLAY_JOB_IDS = new Set<string>();
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

  return Math.max(ROW_HEIGHT, STATION_ROW_PADDING * 2 + row.stationBookings.length * STATION_LANE_HEIGHT);
}

function getStationLaneTopOffset(row: ScheduleGanttRow, laneIndex: number): number {
  const laneCenter = STATION_ROW_PADDING + STATION_LANE_HEIGHT * laneIndex + STATION_LANE_HEIGHT / 2;

  return laneCenter - getScheduleGanttRowHeight(row) / 2;
}

function getScheduleGanttStationOverlays({
  selectedOverlayJobIds,
  sharedBookingJobs,
  stationId,
}: {
  selectedOverlayJobIds: Set<string>;
  sharedBookingJobs: JobSharedStationBookingJob[];
  stationId: string;
}): JobSharedStationBookingJob[] {
  return sharedBookingJobs
    .filter((overlayJob) => selectedOverlayJobIds.has(overlayJob.jobId))
    .map((overlayJob) => ({
      ...overlayJob,
      bookings: overlayJob.bookings.filter((booking) => booking.stationId === stationId),
    }))
    .filter((overlayJob) => overlayJob.bookings.length > 0);
}

function isScheduleGanttActualPastPlannedEnd(row: ScheduleGanttEditableItem, now = new Date()): boolean {
  const plannedEnd = parseScheduleDate(row.plannedEnd);
  if (!plannedEnd) return false;

  const actualEnd = parseScheduleDate(row.actualEnd);
  const actualComparisonDate = actualEnd ?? parseScheduleDate(now.toISOString());

  return actualComparisonDate ? actualComparisonDate.getTime() > plannedEnd.getTime() : false;
}

function getScheduleGanttActualClassName(row: ScheduleGanttEditableItem): string {
  if (isScheduleGanttActualPastPlannedEnd(row)) return 'bg-red-600 text-white';

  return row.actualEnd ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white';
}

function getScheduleGanttPlannedClassName(row: ScheduleGanttEditableItem): string {
  if (row.level === 'station') return PLANNED_BAR_CLASSES_BY_STAGE[row.stage];

  return 'border-sky-500/70 bg-sky-500/10 text-sky-700 shadow-[inset_0_0_0_1px_rgb(14_165_233_/_0.12)] dark:text-sky-300';
}

export const ScheduleGantt: React.FC<ScheduleGanttProps> = (props) => {
  const isCreateMode = props.mode === 'create';
  const job = isCreateMode ? null : props.job;
  const createRows = isCreateMode ? props.rows : null;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [optimisticPlannedRanges, setOptimisticPlannedRanges] = React.useState<Record<string, OptimisticPlannedRange>>(
    {},
  );
  const [optimisticActualRanges, setOptimisticActualRanges] = React.useState<Record<string, OptimisticActualRange>>({});
  const [scheduleEditCompletionKey, setScheduleEditCompletionKey] = React.useState(0);
  const sharedBookingsQuery = useQuery({
    ...trpc.jobs.listSharedStationBookings.queryOptions({ jobId: job?.id ?? '' }),
    enabled: job !== null,
  });
  const sharedBookingJobs = sharedBookingsQuery.data?.jobs ?? EMPTY_SHARED_BOOKING_JOBS;
  const [overlaySelection, setOverlaySelection] = React.useState<{ jobId: string; jobIds: Set<string> }>(() => ({
    jobId: job?.id ?? '',
    jobIds: new Set(),
  }));
  const selectedOverlayJobIds =
    job && overlaySelection.jobId === job.id ? overlaySelection.jobIds : EMPTY_SELECTED_OVERLAY_JOB_IDS;
  const editDateMutation = useMutation(
    trpc.jobs.editDate.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to update schedule date.'),
    }),
  );

  const rows = React.useMemo(() => {
    const sourceRows = createRows ?? (job ? buildScheduleGanttRows(job) : []);

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
  }, [createRows, job, optimisticActualRanges, optimisticPlannedRanges]);
  const ganttHeight = Math.max(420, 60 + rows.reduce((total, row) => total + getScheduleGanttRowHeight(row), 0));
  const jobDueDate = parseScheduleDate(job?.dueDate ?? null);

  const toggleOverlayJob = (jobId: string) => {
    if (!job) return;

    setOverlaySelection((current) => {
      const next = new Set(current.jobId === job.id ? current.jobIds : []);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }

      return { jobId: job.id, jobIds: next };
    });
  };
  const editPlannedRange = async (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => {
    if (!row.plannedStart || !row.plannedEnd) return;

    if (isCreateMode) {
      props.onEditPlannedRange(row, nextRange);
      return;
    }

    if (!job) return;

    setOptimisticPlannedRanges((current) => ({ ...current, [row.id]: nextRange }));

    let attemptedEdit = false;
    try {
      for (const edit of getScheduleGanttPlannedDateEdits({
        entityId: row.entityId,
        entityLevel: row.level === 'station' ? 'station-booking' : row.level,
        nextPlannedEnd: nextRange.plannedEnd,
        nextPlannedStart: nextRange.plannedStart,
        previousPlannedEnd: row.plannedEnd,
        previousPlannedStart: row.plannedStart,
      })) {
        attemptedEdit = true;
        await editDateMutation.mutateAsync(edit);
      }
      await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: job.id }));
      toast.success('Schedule updated');
    } catch {
      if (attemptedEdit) {
        await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: job.id }));
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
    row: ScheduleGanttEditableItem,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => {
    if (!row.actualStart) return;
    if (!job) return;

    setOptimisticActualRanges((current) => ({ ...current, [row.id]: nextRange }));

    let attemptedEdit = false;
    try {
      for (const edit of getScheduleGanttActualDateEdits({
        entityId: row.entityId,
        entityLevel: row.level === 'station' ? 'station-booking' : row.level,
        nextActualEnd: nextRange.actualEnd,
        nextActualStart: nextRange.actualStart,
        previousActualEnd: row.actualEnd,
        previousActualStart: row.actualStart,
      })) {
        attemptedEdit = true;
        await editDateMutation.mutateAsync(edit);
      }
      await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: job.id }));
      if (attemptedEdit) {
        toast.success('Actual dates updated');
      }
    } catch {
      if (attemptedEdit) {
        await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: job.id }));
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Schedule</h2>
          <p className="text-sm text-muted-foreground">
            {isCreateMode
              ? 'Planned windows by Job, Department, and Station.'
              : 'Planned windows and actual progress by Job, Department, and Station.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <LegendItem className="border border-sky-500/70 bg-transparent" label="Planned" />
          {isCreateMode ? null : <LegendItem className="bg-sky-600" label="Actual" />}
          {isCreateMode ? null : <LegendItem className="bg-red-600" label="Job Due Date" />}
          {isCreateMode ? null : (
            <LegendItem className="bg-muted-foreground/45 ring-1 ring-muted-foreground/50" label="Other job" />
          )}
          <span className="inline-flex items-center gap-1">
            <DiamondIcon data-icon="inline-start" />
            Milestone
          </span>
          {!isCreateMode && sharedBookingJobs.length > 0 ? (
            <SharedStationJobPicker
              isLoading={sharedBookingsQuery.isLoading}
              jobs={sharedBookingJobs}
              onToggleJob={toggleOverlayJob}
              selectedJobIds={selectedOverlayJobIds}
            />
          ) : null}
        </div>
      </div>
      <div style={{ height: ganttHeight }}>
        <GanttProvider className="rounded-md border bg-background" range="daily" zoom={70}>
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
            <GanttFeatureList className="absolute top-0 left-0 h-full w-max space-y-0">
              {rows.map((row) => (
                <ScheduleGanttTimelineRow
                  canEditActualBars={!isCreateMode && props.canEditSchedule && !editDateMutation.isPending}
                  canEditPlannedBars={props.canEditSchedule && !editDateMutation.isPending}
                  key={row.id}
                  onEditActualDates={editActualDates}
                  onEditPlannedRange={editPlannedRange}
                  previewResetVersion={scheduleEditCompletionKey}
                  row={row}
                  selectedOverlayJobIds={selectedOverlayJobIds}
                  sharedBookingJobs={sharedBookingJobs}
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

const SharedStationJobPicker: React.FC<{
  isLoading: boolean;
  jobs: JobSharedStationBookingJob[];
  onToggleJob: (jobId: string) => void;
  selectedJobIds: Set<string>;
}> = ({ isLoading, jobs, onToggleJob, selectedJobIds }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button disabled={isLoading} size="sm" type="button" variant="outline">
          <BriefcaseBusinessIcon data-icon="inline-start" />
          Station contention
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      }
    />
    <DropdownMenuContent align="end" className="min-w-80">
      <DropdownMenuLabel>Jobs sharing stations</DropdownMenuLabel>
      <DropdownMenuGroup>
        {jobs.map((job) => (
          <DropdownMenuCheckboxItem
            checked={selectedJobIds.has(job.jobId)}
            className="items-start py-2 pr-8"
            key={job.jobId}
            onClick={() => onToggleJob(job.jobId)}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{job.jobCode}</span>
              <span className="truncate text-xs text-muted-foreground">
                {job.productModelCode} - {job.bookings.length} shared booking{job.bookings.length === 1 ? '' : 's'}
              </span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

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
  onEditActualDates: (
    row: ScheduleGanttEditableItem,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => void;
  onEditPlannedRange: (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => void;
  previewResetVersion: number;
  row: ScheduleGanttRow;
  selectedOverlayJobIds: Set<string>;
  sharedBookingJobs: JobSharedStationBookingJob[];
}> = ({
  canEditActualBars,
  canEditPlannedBars,
  onEditActualDates,
  onEditPlannedRange,
  previewResetVersion,
  row,
  selectedOverlayJobIds,
  sharedBookingJobs,
}) => (
  <ScheduleGanttTimelineRowInner
    canEditActualBars={canEditActualBars}
    canEditPlannedBars={canEditPlannedBars}
    onEditActualDates={onEditActualDates}
    onEditPlannedRange={onEditPlannedRange}
    previewResetVersion={previewResetVersion}
    row={row}
    selectedOverlayJobIds={selectedOverlayJobIds}
    sharedBookingJobs={sharedBookingJobs}
  />
);

const ScheduleGanttTimelineRowInner: React.FC<{
  canEditActualBars: boolean;
  canEditPlannedBars: boolean;
  onEditActualDates: (
    row: ScheduleGanttEditableItem,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => void;
  onEditPlannedRange: (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => void;
  previewResetVersion: number;
  row: ScheduleGanttRow;
  selectedOverlayJobIds: Set<string>;
  sharedBookingJobs: JobSharedStationBookingJob[];
}> = ({
  canEditActualBars,
  canEditPlannedBars,
  onEditActualDates,
  onEditPlannedRange,
  previewResetVersion,
  row,
  selectedOverlayJobIds,
  sharedBookingJobs,
}) => {
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
          selectedOverlayJobIds={selectedOverlayJobIds}
          sharedBookingJobs={sharedBookingJobs}
        />
      )}
    </div>
  );
};

const ScheduleGanttStationLanes: React.FC<{
  canEditActualBars: boolean;
  canEditPlannedBars: boolean;
  onEditActualDates: (
    row: ScheduleGanttEditableItem,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => void;
  onEditPlannedRange: (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => void;
  previewResetVersion: number;
  row: ScheduleGanttRow;
  selectedOverlayJobIds: Set<string>;
  sharedBookingJobs: JobSharedStationBookingJob[];
}> = ({
  canEditActualBars,
  canEditPlannedBars,
  onEditActualDates,
  onEditPlannedRange,
  previewResetVersion,
  row,
  selectedOverlayJobIds,
  sharedBookingJobs,
}) => (
  <>
    {row.stationBookings.map((stationBooking, laneIndex) => (
      <ScheduleGanttStationLane
        canEditActualBars={canEditActualBars}
        canEditPlannedBars={canEditPlannedBars}
        key={stationBooking.id}
        laneIndex={laneIndex}
        onEditActualDates={onEditActualDates}
        onEditPlannedRange={onEditPlannedRange}
        previewResetVersion={previewResetVersion}
        overlays={getScheduleGanttStationOverlays({
          selectedOverlayJobIds,
          sharedBookingJobs,
          stationId: stationBooking.stationId,
        })}
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
  onEditActualDates: (
    row: ScheduleGanttEditableItem,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => void;
  onEditPlannedRange: (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => void;
  overlays: JobSharedStationBookingJob[];
  previewResetVersion: number;
  row: ScheduleGanttRow;
  stationBooking: ScheduleGanttStationBooking;
}> = ({
  canEditActualBars,
  canEditPlannedBars,
  laneIndex,
  onEditActualDates,
  onEditPlannedRange,
  overlays,
  previewResetVersion,
  row,
  stationBooking,
}) => {
  const topOffset = getStationLaneTopOffset(row, laneIndex);
  const stationLabel = stationBooking.title;

  return (
    <>
      <ScheduleGanttOccupancyOverlays jobs={overlays} topOffset={topOffset + STATION_ACTUAL_OFFSET} />
      <ScheduleGanttPlannedRange
        canEdit={canEditPlannedBars}
        onEdit={onEditPlannedRange}
        previewResetVersion={previewResetVersion}
        row={stationBooking}
        topOffset={topOffset}
        visibleLabel={stationLabel}
      />
      <ScheduleGanttActualRange
        canEdit={canEditActualBars}
        onEdit={onEditActualDates}
        previewResetVersion={previewResetVersion}
        row={stationBooking}
        topOffset={topOffset + STATION_ACTUAL_OFFSET}
      />
    </>
  );
};

const ScheduleGanttOccupancyOverlays: React.FC<{ jobs: JobSharedStationBookingJob[]; topOffset: number }> = ({
  jobs,
  topOffset,
}) => (
  <>
    {jobs
      .flatMap((job) => job.bookings.map((booking) => ({ booking, jobCode: job.jobCode, jobId: job.jobId })))
      .map((overlay, laneIndex) => (
        <ScheduleGanttOccupancyBar
          booking={overlay.booking}
          jobCode={overlay.jobCode}
          key={`${overlay.jobId}-${overlay.booking.id}`}
          laneIndex={laneIndex}
          topOffset={topOffset}
        />
      ))}
  </>
);

const ScheduleGanttOccupancyBar: React.FC<{
  booking: JobSharedStationBookingJob['bookings'][number];
  jobCode: string;
  laneIndex: number;
  topOffset: number;
}> = ({ booking, jobCode, laneIndex, topOffset }) => {
  const occupancy = getScheduleGanttOccupancyDisplay(booking, jobCode);

  if (occupancy.kind === 'none') {
    return null;
  }

  return (
    <ScheduleGanttBar
      className={cn(
        'bg-muted-foreground/45 shadow-sm ring-1 ring-muted-foreground/50',
        occupancy.openEnded && 'rounded-r-none',
      )}
      end={occupancy.end}
      height={8}
      label={occupancy.label}
      start={occupancy.start}
      topOffset={topOffset + laneIndex * 5 - 10}
    />
  );
};

const ScheduleGanttPlannedRange: React.FC<{
  canEdit: boolean;
  onEdit: (row: ScheduleGanttEditableItem, nextRange: OptimisticPlannedRange) => void;
  previewResetVersion?: number;
  row: ScheduleGanttEditableItem;
  topOffset?: number;
  visibleLabel?: string | undefined;
}> = ({ canEdit, onEdit, previewResetVersion, row, topOffset = 0, visibleLabel }) => {
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
        topOffset={topOffset}
      />
    );
  }

  return (
    <ScheduleGanttBar
      className={cn(
        'border bg-background/80',
        row.level === 'station' &&
          'before:absolute before:top-0 before:left-0 before:h-full before:w-1 before:content-[""]',
        getScheduleGanttPlannedClassName(row),
        row.level === 'job' && 'bg-sky-500/50',
      )}
      editable={canEdit}
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
        onEdit(row, nextRange);
        return true;
      }}
      end={planned.end}
      label={getScheduleGanttBarLabel(row, planned.label)}
      start={planned.start}
      topOffset={topOffset}
      visibleLabel={visibleLabel}
      visibleLabelDepartment={row.level === 'station' ? row.stage : undefined}
      showEditHandles={row.level === 'station'}
    />
  );
};

const ScheduleGanttActualRange: React.FC<{
  canEdit: boolean;
  onEdit: (row: ScheduleGanttEditableItem, nextRange: { actualEnd: string | null; actualStart: string }) => void;
  previewResetVersion?: number;
  row: ScheduleGanttEditableItem;
  topOffset?: number;
  visibleLabel?: string | undefined;
}> = ({ canEdit, onEdit, previewResetVersion, row, topOffset = 0, visibleLabel }) => {
  const actual = getScheduleGanttActualDisplay(row);

  if (actual.kind === 'none') {
    return null;
  }

  if (canEdit && row.actualStart) {
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

  if (!editable) {
    return wrapWithHoverCard(
      <div
        aria-label={label}
        className={cn('absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-sm', className)}
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
        className,
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
  topOffset?: number;
}> = ({ date, hoverCard, label, topOffset = 0 }) => {
  const gantt = useGanttContext();

  if (!date) return null;

  const left = getGanttOffset(date, gantt);

  const milestone = (
    <div
      aria-label={label}
      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-sky-500 bg-background"
      role="img"
      style={{ left: Math.round(left), top: `calc(50% + ${topOffset}px)` }}
      title={hoverCard ? undefined : label}
    />
  );

  return hoverCard ? <ScheduleGanttBarHoverCard card={hoverCard} trigger={milestone} /> : milestone;
};

const LegendItem: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="inline-flex items-center gap-1">
    <span className={cn('h-2 w-5 rounded-sm', className)} />
    {label}
  </span>
);
