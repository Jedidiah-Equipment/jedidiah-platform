import type { JobDetail } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronRightIcon, CircleIcon, DiamondIcon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import {
  GanttFeatureList,
  GanttHeader,
  GanttProvider,
  GanttTimeline,
  GanttToday,
  getGanttOffset,
  getGanttWidth,
  useGanttContext,
} from '@/components/kibo-ui/gantt/index.js';
import { Button } from '@/components/ui/button.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import {
  buildScheduleGanttRows,
  type DueDragAction,
  getScheduleGanttActualDisplay,
  getScheduleGanttDueDateEdits,
  getScheduleGanttDueDisplay,
  getScheduleGanttDueRangeAfterDrag,
  getScheduleGanttTimelineDayCount,
  type OptimisticDueRange,
  type ScheduleGanttRow,
} from './schedule-gantt-helpers.js';

type ScheduleGanttProps = {
  canEditDueBars: boolean;
  job: JobDetail;
};

type ScheduleGanttRenderableRow = ScheduleGanttRow & {
  expanded: boolean;
  visible: boolean;
};

const SIDEBAR_WIDTH = 300;
const ROW_HEIGHT = 42;

export const ScheduleGantt: React.FC<ScheduleGanttProps> = ({ canEditDueBars, job }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [optimisticDueRanges, setOptimisticDueRanges] = React.useState<Record<string, OptimisticDueRange>>({});
  const editDateMutation = useMutation(
    trpc.jobs.editDate.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to reschedule job.'),
    }),
  );
  const rows = React.useMemo(
    () =>
      buildScheduleGanttRows(job).map((row) => {
        const optimisticRange = optimisticDueRanges[row.id];

        return optimisticRange ? { ...row, ...optimisticRange } : row;
      }),
    [job, optimisticDueRanges],
  );
  const stageIds = React.useMemo(() => rows.filter((row) => row.level === 'stage').map((row) => row.id), [rows]);
  const [collapsedStageIds, setCollapsedStageIds] = React.useState<Set<string>>(() => new Set());
  const visibleRows = React.useMemo<ScheduleGanttRenderableRow[]>(
    () =>
      rows.map((row) => {
        const isCollapsedChild = row.parentId ? collapsedStageIds.has(row.parentId) : false;

        return {
          ...row,
          expanded: row.level === 'stage' ? !collapsedStageIds.has(row.id) : false,
          visible: !isCollapsedChild,
        };
      }),
    [collapsedStageIds, rows],
  );
  const visibleRowCount = visibleRows.filter((row) => row.visible).length;
  const ganttHeight = Math.max(420, 60 + visibleRowCount * ROW_HEIGHT);

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
  const editDueRange = async (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => {
    if (!row.dueStart || !row.dueEnd) return;

    setOptimisticDueRanges((current) => ({ ...current, [row.id]: nextRange }));

    try {
      for (const edit of getScheduleGanttDueDateEdits({
        entityId: row.entityId,
        entityLevel: row.level === 'station' ? 'station-booking' : row.level,
        nextDueEnd: nextRange.dueEnd,
        nextDueStart: nextRange.dueStart,
        previousDueEnd: row.dueEnd,
        previousDueStart: row.dueStart,
      })) {
        await editDateMutation.mutateAsync(edit);
      }
      await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: job.id }));
      toast.success('Schedule updated');
      setOptimisticDueRanges((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    } catch {
      setOptimisticDueRanges((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Due ranges and actual progress by Job, Department, and Station.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <LegendItem className="border border-sky-500/70 bg-transparent" label="Due" />
          <LegendItem className="bg-sky-600" label="Actual" />
          <span className="inline-flex items-center gap-1">
            <DiamondIcon data-icon="inline-start" />
            Milestone
          </span>
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
            <GanttFeatureList className="absolute top-0 left-0 h-full w-max space-y-0">
              {visibleRows.map((row) =>
                row.visible ? (
                  <ScheduleGanttTimelineRow
                    canEditDueBars={canEditDueBars && !editDateMutation.isPending}
                    key={row.id}
                    onEditDueRange={editDueRange}
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
  canEditDueBars: boolean;
  onEditDueRange: (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => void;
  row: ScheduleGanttRow;
}> = ({ canEditDueBars, onEditDueRange, row }) => (
  <ScheduleGanttTimelineRowInner canEditDueBars={canEditDueBars} onEditDueRange={onEditDueRange} row={row} />
);

const ScheduleGanttTimelineRowInner: React.FC<{
  canEditDueBars: boolean;
  onEditDueRange: (row: ScheduleGanttRow, nextRange: OptimisticDueRange) => void;
  row: ScheduleGanttRow;
}> = ({ canEditDueBars, onEditDueRange, row }) => {
  const gantt = useGanttContext();
  const dayCount = getScheduleGanttTimelineDayCount(gantt.timelineData);

  return (
    <div
      className={cn('relative border-b', row.level === 'job' && 'bg-muted/20')}
      style={{ height: ROW_HEIGHT, width: `calc(var(--gantt-column-width) * ${dayCount})` }}
    >
      <ScheduleGanttDueRange canEdit={canEditDueBars} onEdit={onEditDueRange} row={row} />
      <ScheduleGanttActualRange row={row} />
    </div>
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
      className="border border-sky-500/70 bg-sky-500/10"
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
      {...due}
    />
  );
};

const ScheduleGanttActualRange: React.FC<{ row: ScheduleGanttRow }> = ({ row }) => {
  const actual = getScheduleGanttActualDisplay(row);

  if (actual.kind === 'none') {
    return null;
  }

  return (
    <ScheduleGanttBar
      className={cn('bg-sky-600 shadow-sm', actual.openEnded && 'rounded-r-none')}
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
}> = ({ className, editable = false, end, label, onEdit, start }) => {
  const gantt = useGanttContext();
  const dragStartRef = React.useRef<{ action: DueDragAction; pointerX: number } | null>(null);
  const left = getGanttOffset(start, gantt);
  const width = getGanttWidth(start, end, gantt);
  const commitDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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

  return (
    <div
      aria-label={label}
      className={cn('absolute top-1/2 h-4 -translate-y-1/2 rounded-sm', editable && 'cursor-grab', className)}
      onPointerDown={editable ? (event) => startDrag(event, 'move') : undefined}
      onPointerUp={editable ? commitDrag : undefined}
      role="img"
      style={{ left: Math.round(left), width: Math.max(Math.round(width), 10) }}
      title={label}
    >
      {editable ? (
        <>
          <span
            aria-hidden="true"
            className="absolute top-0 left-0 h-full w-2 cursor-ew-resize rounded-l-sm"
            onPointerDown={(event) => {
              event.stopPropagation();
              startDrag(event, 'resize-start');
            }}
            onPointerUp={commitDrag}
          />
          <span
            aria-hidden="true"
            className="absolute top-0 right-0 h-full w-2 cursor-ew-resize rounded-r-sm"
            onPointerDown={(event) => {
              event.stopPropagation();
              startDrag(event, 'resize-end');
            }}
            onPointerUp={commitDrag}
          />
        </>
      ) : null}
    </div>
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
