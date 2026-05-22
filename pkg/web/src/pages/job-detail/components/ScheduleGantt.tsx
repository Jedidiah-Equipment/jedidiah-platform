import type { JobDetail, JobSharedStationBookingJob } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusinessIcon, ChevronDownIcon, ChevronRightIcon, CircleIcon, DiamondIcon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

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
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import {
  buildScheduleGanttRows,
  type DueDragAction,
  getScheduleGanttActualDateEdits,
  getScheduleGanttActualDisplay,
  getScheduleGanttActualRangeAfterDrag,
  getScheduleGanttDueDateEdits,
  getScheduleGanttDueDisplay,
  getScheduleGanttDueRangeAfterDrag,
  getScheduleGanttOccupancyDisplay,
  getScheduleGanttTimelineDayCount,
  type OptimisticDueRange,
  parseScheduleDate,
  type ScheduleGanttRow,
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
      onEditDueRange: (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => void;
      rows: ScheduleGanttRow[];
    };

type ScheduleGanttRenderableRow = ScheduleGanttRow & {
  expanded: boolean;
  overlays: JobSharedStationBookingJob[];
  visible: boolean;
};

const SIDEBAR_WIDTH = 300;
const ROW_HEIGHT = 42;
const EMPTY_SHARED_BOOKING_JOBS: JobSharedStationBookingJob[] = [];
const EMPTY_SELECTED_OVERLAY_JOB_IDS = new Set<string>();

export const ScheduleGantt: React.FC<ScheduleGanttProps> = (props) => {
  const isCreateMode = props.mode === 'create';
  const job = isCreateMode ? null : props.job;
  const createRows = isCreateMode ? props.rows : null;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [optimisticDueRanges, setOptimisticDueRanges] = React.useState<Record<string, OptimisticDueRange>>({});
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
      const optimisticRange = optimisticDueRanges[row.id];

      return optimisticRange ? { ...row, ...optimisticRange } : row;
    });
  }, [createRows, job, optimisticDueRanges]);
  const stageIds = React.useMemo(() => rows.filter((row) => row.level === 'stage').map((row) => row.id), [rows]);
  const [collapsedStageIds, setCollapsedStageIds] = React.useState<Set<string>>(() => new Set());
  const visibleRows = React.useMemo<ScheduleGanttRenderableRow[]>(
    () =>
      rows.map((row) => {
        const isCollapsedChild = row.parentId ? collapsedStageIds.has(row.parentId) : false;
        const overlays =
          row.level === 'station' && row.stationId
            ? sharedBookingJobs
                .filter((overlayJob) => selectedOverlayJobIds.has(overlayJob.jobId))
                .map((overlayJob) => ({
                  ...overlayJob,
                  bookings: overlayJob.bookings.filter((booking) => booking.stationId === row.stationId),
                }))
                .filter((overlayJob) => overlayJob.bookings.length > 0)
            : [];

        return {
          ...row,
          expanded: row.level === 'stage' ? !collapsedStageIds.has(row.id) : false,
          overlays,
          visible: !isCollapsedChild,
        };
      }),
    [collapsedStageIds, rows, selectedOverlayJobIds, sharedBookingJobs],
  );
  const visibleRowCount = visibleRows.filter((row) => row.visible).length;
  const ganttHeight = Math.max(420, 60 + visibleRowCount * ROW_HEIGHT);
  const jobDueDate = parseScheduleDate(job?.dueDate ?? null);

  const toggleStage = (stageId: string) => {
    setCollapsedStageIds((current) => {
      const next = new Set(current);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };
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
  const editDueRange = async (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => {
    if (!row.dueStart || !row.dueEnd) return;

    if (isCreateMode) {
      props.onEditDueRange(row, nextRange);
      return;
    }

    if (!job) return;

    setOptimisticDueRanges((current) => ({ ...current, [row.id]: nextRange }));

    let attemptedEdit = false;
    try {
      for (const edit of getScheduleGanttDueDateEdits({
        entityId: row.entityId,
        entityLevel: row.level === 'station' ? 'station-booking' : row.level,
        nextDueEnd: nextRange.dueEnd,
        nextDueStart: nextRange.dueStart,
        previousDueEnd: row.dueEnd,
        previousDueStart: row.dueStart,
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
      setOptimisticDueRanges((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    }
  };
  const editActualDates = async (
    row: ScheduleGanttRow,
    nextRange: { actualEnd: string | null; actualStart: string },
  ) => {
    if (!row.actualStart) return;
    if (!job) return;

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
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Schedule</h2>
          <p className="text-sm text-muted-foreground">
            {isCreateMode
              ? 'Due ranges by Job, Department, and Station.'
              : 'Due ranges and actual progress by Job, Department, and Station.'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <LegendItem className="border border-sky-500/70 bg-transparent" label="Due" />
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
          <ScheduleGanttSidebar
            collapsedStageIds={collapsedStageIds}
            rows={visibleRows}
            stageIds={stageIds}
            toggleStage={toggleStage}
          />
          <GanttTimeline>
            <GanttHeader />
            {jobDueDate ? (
              <GanttMarker
                className="border-red-700 bg-red-600 text-white"
                date={jobDueDate}
                id={`job-due-date-${job?.id ?? ''}`}
                label="Job Due Date"
              />
            ) : null}
            <GanttFeatureList className="absolute top-0 left-0 h-full w-max space-y-0">
              {visibleRows.map((row) =>
                row.visible ? (
                  <ScheduleGanttTimelineRow
                    canEditActualBars={
                      row.level === 'station' && !isCreateMode && props.canEditSchedule && !editDateMutation.isPending
                    }
                    canEditDueBars={row.level === 'station' && props.canEditSchedule && !editDateMutation.isPending}
                    key={row.id}
                    onEditActualDates={editActualDates}
                    onEditDueRange={editDueRange}
                    overlays={row.overlays}
                    row={row}
                  />
                ) : null,
              )}
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
  collapsedStageIds: Set<string>;
  rows: ScheduleGanttRenderableRow[];
  stageIds: string[];
  toggleStage: (stageId: string) => void;
}> = ({ collapsedStageIds, rows, stageIds, toggleStage }) => (
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
      if (!row.visible) return null;

      const isStage = stageIds.includes(row.id);
      const isCollapsed = collapsedStageIds.has(row.id);

      return (
        <div
          className={cn(
            'flex items-center gap-2 border-b px-3 text-xs',
            row.level === 'job' && 'bg-muted/50 font-medium',
            row.level === 'station' && 'pl-9',
          )}
          key={row.id}
          style={{ height: ROW_HEIGHT }}
        >
          {isStage ? (
            <Button
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${row.title}`}
              className="shrink-0"
              onClick={() => toggleStage(row.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </Button>
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center">
              <CircleIcon className={cn('text-muted-foreground', row.level === 'station' && 'size-2 fill-current')} />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{row.title}</span>
          <span className="shrink-0 text-muted-foreground">{row.statusLabel}</span>
        </div>
      );
    })}
  </div>
);

const ScheduleGanttTimelineRow: React.FC<{
  canEditActualBars: boolean;
  canEditDueBars: boolean;
  onEditActualDates: (row: ScheduleGanttRow, nextRange: { actualEnd: string | null; actualStart: string }) => void;
  onEditDueRange: (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => void;
  overlays: JobSharedStationBookingJob[];
  row: ScheduleGanttRow;
}> = ({ canEditActualBars, canEditDueBars, onEditActualDates, onEditDueRange, overlays, row }) => (
  <ScheduleGanttTimelineRowInner
    canEditActualBars={canEditActualBars}
    canEditDueBars={canEditDueBars}
    onEditActualDates={onEditActualDates}
    onEditDueRange={onEditDueRange}
    overlays={overlays}
    row={row}
  />
);

const ScheduleGanttTimelineRowInner: React.FC<{
  canEditActualBars: boolean;
  canEditDueBars: boolean;
  onEditActualDates: (row: ScheduleGanttRow, nextRange: { actualEnd: string | null; actualStart: string }) => void;
  onEditDueRange: (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => void;
  overlays: JobSharedStationBookingJob[];
  row: ScheduleGanttRow;
}> = ({ canEditActualBars, canEditDueBars, onEditActualDates, onEditDueRange, overlays, row }) => {
  const gantt = useGanttContext();
  const dayCount = getScheduleGanttTimelineDayCount(gantt.timelineData);

  return (
    <div
      className={cn('relative border-b', row.level === 'job' && 'bg-muted/20')}
      style={{ height: ROW_HEIGHT, width: `calc(var(--gantt-column-width) * ${dayCount})` }}
    >
      <ScheduleGanttOccupancyOverlays jobs={overlays} />
      <ScheduleGanttDueRange canEdit={canEditDueBars} onEdit={onEditDueRange} row={row} />
      <ScheduleGanttActualRange canEdit={canEditActualBars} onEdit={onEditActualDates} row={row} />
    </div>
  );
};

const ScheduleGanttOccupancyOverlays: React.FC<{ jobs: JobSharedStationBookingJob[] }> = ({ jobs }) => (
  <>
    {jobs
      .flatMap((job) => job.bookings.map((booking) => ({ booking, jobCode: job.jobCode, jobId: job.jobId })))
      .map((overlay, laneIndex) => (
        <ScheduleGanttOccupancyBar
          booking={overlay.booking}
          jobCode={overlay.jobCode}
          key={`${overlay.jobId}-${overlay.booking.id}`}
          laneIndex={laneIndex}
        />
      ))}
  </>
);

const ScheduleGanttOccupancyBar: React.FC<{
  booking: JobSharedStationBookingJob['bookings'][number];
  jobCode: string;
  laneIndex: number;
}> = ({ booking, jobCode, laneIndex }) => {
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
      label={occupancy.label}
      start={occupancy.start}
      topOffset={laneIndex * 5 - 10}
    />
  );
};

const ScheduleGanttDueRange: React.FC<{
  canEdit: boolean;
  onEdit: (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => void;
  row: ScheduleGanttRow;
}> = ({ canEdit, onEdit, row }) => {
  const due = getScheduleGanttDueDisplay(row);

  if (due.kind === 'none') {
    return null;
  }

  if (due.kind === 'milestone') {
    return <ScheduleGanttMilestone date={due.date} label={due.label} />;
  }

  return (
    <ScheduleGanttBar
      className={cn(
        'border border-sky-500/70 bg-sky-500/10',
        row.level !== 'station' && 'h-1 border-sky-500/60 bg-sky-500/50',
      )}
      editable={canEdit}
      onEdit={(action, dayDelta) => {
        const nextRange = getScheduleGanttDueRangeAfterDrag({
          action,
          dayDelta,
          dueEnd: row.dueEnd,
          dueStart: row.dueStart,
        });
        if (nextRange) {
          onEdit(row, nextRange);
        }
      }}
      end={due.end}
      label={due.label}
      start={due.start}
    />
  );
};

const ScheduleGanttActualRange: React.FC<{
  canEdit: boolean;
  onEdit: (row: ScheduleGanttRow, nextRange: { actualEnd: string | null; actualStart: string }) => void;
  row: ScheduleGanttRow;
}> = ({ canEdit, onEdit, row }) => {
  const actual = getScheduleGanttActualDisplay(row);

  if (actual.kind === 'none') {
    return null;
  }

  if (canEdit && row.actualStart) {
    return (
      <ScheduleGanttBar
        className={cn('z-20 bg-sky-600 shadow-sm', actual.openEnded && 'rounded-r-none')}
        editable
        end={actual.end}
        label={actual.label}
        onEdit={(action, dayDelta) => {
          const nextRange = getScheduleGanttActualRangeAfterDrag({
            action,
            actualEnd: row.actualEnd,
            actualStart: row.actualStart,
            dayDelta,
          });
          if (nextRange) {
            onEdit(row, nextRange);
          }
        }}
        start={actual.start}
      />
    );
  }

  return (
    <ScheduleGanttBar
      className={cn('z-20 bg-sky-600 shadow-sm', actual.openEnded && 'rounded-r-none')}
      end={actual.end}
      label={actual.label}
      start={actual.start}
    />
  );
};

const ScheduleGanttBar: React.FC<{
  className: string;
  editable?: boolean;
  end: Date;
  label: string;
  onEdit?: (action: DueDragAction, dayDelta: number) => void;
  start: Date;
  topOffset?: number;
}> = ({ className, editable = false, end, label, onEdit, start, topOffset = 0 }) => {
  const gantt = useGanttContext();
  const dragStartRef = React.useRef<{ action: DueDragAction; pointerX: number } | null>(null);
  const left = getGanttOffset(start, gantt);
  const width = getGanttWidth(start, end, gantt);
  const commitDrag = React.useCallback(
    (event: React.PointerEvent<Element>) => {
      const dragStart = dragStartRef.current;
      dragStartRef.current = null;
      if (!dragStart || !onEdit) return;

      const dayDelta = Math.round((event.clientX - dragStart.pointerX) / gantt.columnWidth);
      if (dayDelta !== 0) {
        onEdit(dragStart.action, dayDelta);
      }
    },
    [gantt.columnWidth, onEdit],
  );
  const startDrag = React.useCallback((event: React.PointerEvent<Element>, action: DueDragAction) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { action, pointerX: event.clientX };
  }, []);
  const cancelDrag = React.useCallback(() => {
    dragStartRef.current = null;
  }, []);

  if (!editable) {
    return (
      <div
        aria-label={label}
        className={cn('absolute top-1/2 h-4 -translate-y-1/2 rounded-sm', className)}
        role="img"
        style={{ left: Math.round(left), top: `calc(50% + ${topOffset}px)`, width: Math.max(Math.round(width), 10) }}
        title={label}
      />
    );
  }

  return (
    <button
      aria-label={`${label}; drag to move, drag either edge to resize`}
      className={cn('absolute top-1/2 h-4 -translate-y-1/2 cursor-grab appearance-none rounded-sm p-0', className)}
      onPointerCancel={cancelDrag}
      onPointerDown={(event) => startDrag(event, 'move')}
      onPointerUp={commitDrag}
      style={{ left: Math.round(left), top: `calc(50% + ${topOffset}px)`, width: Math.max(Math.round(width), 10) }}
      title={label}
      type="button"
    >
      <span
        className="absolute top-0 left-0 h-full w-2 cursor-ew-resize rounded-l-sm"
        onPointerCancel={cancelDrag}
        onPointerDown={(event) => {
          event.stopPropagation();
          startDrag(event, 'resize-start');
        }}
        onPointerUp={commitDrag}
      />
      <span
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize rounded-r-sm"
        onPointerCancel={cancelDrag}
        onPointerDown={(event) => {
          event.stopPropagation();
          startDrag(event, 'resize-end');
        }}
        onPointerUp={commitDrag}
      />
    </button>
  );
};

const ScheduleGanttMilestone: React.FC<{ date: Date | null; label: string }> = ({ date, label }) => {
  const gantt = useGanttContext();

  if (!date) return null;

  const left = getGanttOffset(date, gantt);

  return (
    <div
      aria-label={label}
      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-sky-500 bg-background"
      role="img"
      style={{ left: Math.round(left) }}
      title={label}
    />
  );
};

const LegendItem: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="inline-flex items-center gap-1">
    <span className={cn('h-2 w-5 rounded-sm', className)} />
    {label}
  </span>
);
