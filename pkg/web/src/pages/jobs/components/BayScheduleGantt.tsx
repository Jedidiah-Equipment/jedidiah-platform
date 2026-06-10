import {
  addJobSlotDuration,
  canScheduleBay,
  formatDate,
  type SlotCalendarDays,
  segmentSlotCalendarDays,
  summarizeSlotCalendarDays,
  type WorkingCalendar,
} from '@pkg/domain';
import type { BaySchedule, JobSlotPlacement, JobSummary, OffDay, ProjectedJobSlot, UUID } from '@pkg/schema';
import { IconAlertTriangle, IconClockPlus, IconLoader2, IconMinus, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import {
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttTimeline,
  GanttToday,
  getGanttCenteredDateFromScrollLeft,
  useGanttContext,
} from '@/components/kibo-ui/gantt/index.js';
import { Button } from '@/components/ui/button.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { allJobsInput } from './all-jobs-input.js';
import { OffDayBands } from './BayCalendarOverlays.js';
import { BayScheduleFilterBar } from './BayScheduleFilterBar.js';
import { BaySlotDayHatch, BaySlotJobCard } from './BaySlotJobCard.js';
import {
  type BayScheduleFilter,
  countBayScheduleFilterMatches,
  emptyBayScheduleFilter,
  getEarliestBayScheduleFilterMatchStart,
  hasActiveBayScheduleFilter,
  slotMatchesBayScheduleFilter,
} from './bay-schedule-filter.js';
import { createWorkingCalendarsByBayId, getSlotLabel } from './bay-schedule-summary.js';
import {
  BAY_SCHEDULE_ZOOM_DEFAULT,
  BAY_SCHEDULE_ZOOM_MAX,
  BAY_SCHEDULE_ZOOM_MIN,
  useBayScheduleViewStore,
} from './bay-schedule-view-store.js';
import { fromJobCalendarDateKey, toJobCalendarDate } from './job-date-key.js';
import { getJobGanttOffset, getJobGanttResizeStepWidth, getJobGanttWidth } from './job-gantt-geometry.js';
import { getMaintainedHorizonWarnings, type MaintainedHorizonWarning } from './maintained-horizon.js';

// Taller rows give each booked slot room for the rich job card (thumbnails + details).
const BAY_ROW_HEIGHT = 72;
// Slot card height, leaving a small inset above/below within the row.
const SLOT_CARD_HEIGHT = 60;
const IDLE_SLOT_HATCH_BACKGROUND =
  'repeating-linear-gradient(45deg, rgb(113 113 122 / 0.18) 0 5px, transparent 5px 10px)';

type FilterScrollRequest = {
  date: Date;
  id: number;
};

type AnchoredZoomChange = (applyZoomChange: () => void) => void;

export const BayScheduleGantt: React.FC<{
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
}> = ({ onSelectSlot }) => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const accessQuery = useAccess();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));
  const bays = baysQuery.data?.items ?? [];
  const enabledBayIds = useMemo(
    () => new Set((enabledBaysQuery.data?.items ?? []).map((bay) => bay.id)),
    [enabledBaysQuery.data?.items],
  );
  const schedulableBays = useMemo(
    () => bays.filter((bay) => enabledBayIds.has(bay.id) && canScheduleBay(accessQuery.data, bay.department)),
    [accessQuery.data, bays, enabledBayIds],
  );
  const schedulableBayIds = useMemo(() => new Set(schedulableBays.map((bay) => bay.id)), [schedulableBays]);
  const offDays = baysQuery.data?.offDays ?? [];
  const horizonWarnings = useMemo(
    () => new Map(getMaintainedHorizonWarnings({ bays, offDays }).map((warning) => [warning.bayId, warning])),
    [bays, offDays],
  );
  const initialDate = useMemo(() => new Date(), []);
  const [optimisticResizeDaysBySlotId, setOptimisticResizeDaysBySlotId] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<BayScheduleFilter>(emptyBayScheduleFilter);
  const [filterScrollRequest, setFilterScrollRequest] = useState<FilterScrollRequest | null>(null);
  const zoom = useBayScheduleViewStore((state) => state.zoom);
  const resetZoom = useBayScheduleViewStore((state) => state.resetZoom);
  const zoomIn = useBayScheduleViewStore((state) => state.zoomIn);
  const zoomOut = useBayScheduleViewStore((state) => state.zoomOut);
  const anchoredZoomChangeRef = useRef<AnchoredZoomChange | null>(null);
  const jobs = jobsQuery.data?.items ?? [];
  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const isFilterActive = hasActiveBayScheduleFilter(filter);
  const filterMatchCount = useMemo(
    () => (isFilterActive ? countBayScheduleFilterMatches({ bays, filter, jobsById }) : 0),
    [bays, filter, isFilterActive, jobsById],
  );
  const clearOptimisticResize = useCallback((slotId: string) => {
    setOptimisticResizeDaysBySlotId((current) => {
      const { [slotId]: _removed, ...next } = current;
      return next;
    });
  }, []);
  const resizeSlotMutation = useMutation(
    trpc.jobs.resizeSlot.mutationOptions({
      onSuccess: async (_result, variables) => {
        try {
          await invalidateJobs();
          toast.success('Slot resized');
        } finally {
          clearOptimisticResize(variables.slotId);
        }
      },
      onError: (error, variables) => {
        clearOptimisticResize(variables.slotId);
        showMutationError(error, 'Unable to resize slot.');
      },
    }),
  );
  const removeSlotMutation = useMutation(
    trpc.jobs.removeSlot.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Slot removed');
      },
      onError: (error) => showMutationError(error, 'Unable to remove slot.'),
    }),
  );
  const addIdleSlotMutation = useMutation(
    trpc.jobs.addIdleSlot.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Idle slot added');
      },
      onError: (error) => showMutationError(error, 'Unable to add idle slot.'),
    }),
  );
  const isScheduleMutationPending =
    resizeSlotMutation.isPending || removeSlotMutation.isPending || addIdleSlotMutation.isPending;
  const handleResizeSlot = useCallback(
    (slotId: string, durationDays: number) => {
      // Keep the dropped width visible while the projected schedule refetches.
      setOptimisticResizeDaysBySlotId((current) => ({ ...current, [slotId]: durationDays }));
      resizeSlotMutation.mutate({
        durationDays,
        slotId,
      });
    },
    [resizeSlotMutation],
  );
  const handleRemoveSlot = useCallback(
    async (slotId: string) => {
      await removeSlotMutation.mutateAsync({ slotId });
    },
    [removeSlotMutation],
  );
  const handleAddIdleSlot = useCallback(
    (targetSlotId: string, placement: JobSlotPlacement) => {
      addIdleSlotMutation.mutate({
        durationDays: 1,
        label: null,
        placement,
        targetSlotId,
      });
    },
    [addIdleSlotMutation],
  );
  const handleFilterChange = useCallback(
    (nextFilter: BayScheduleFilter) => {
      setFilter(nextFilter);

      if (!hasActiveBayScheduleFilter(nextFilter)) {
        setFilterScrollRequest(null);
        return;
      }

      const targetStart = getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: nextFilter,
        jobsById,
      });

      setFilterScrollRequest((current) =>
        targetStart
          ? {
              date: toJobCalendarDate(targetStart),
              id: (current?.id ?? 0) + 1,
            }
          : null,
      );
    },
    [bays, jobsById],
  );
  const registerAnchoredZoomChange = useCallback((handler: AnchoredZoomChange | null) => {
    anchoredZoomChangeRef.current = handler;
  }, []);
  const applyAnchoredZoomChange = useCallback((applyZoomChange: () => void) => {
    if (!anchoredZoomChangeRef.current) {
      applyZoomChange();
      return;
    }

    anchoredZoomChangeRef.current(applyZoomChange);
  }, []);
  if (baysQuery.isLoading) {
    return <Skeleton className="h-56 w-full" />;
  }

  if (baysQuery.error) {
    return <ErrorMessage error={baysQuery.error} fallbackMessage="Unable to load bay schedule." />;
  }

  if (bays.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <BayScheduleFilterBar
        bays={bays}
        filter={filter}
        jobs={jobs}
        noMatches={isFilterActive && filterMatchCount === 0}
        onFilterChange={handleFilterChange}
        trailingContent={
          <BayScheduleZoomControls
            onReset={() => applyAnchoredZoomChange(resetZoom)}
            onZoomIn={() => applyAnchoredZoomChange(zoomIn)}
            onZoomOut={() => applyAnchoredZoomChange(zoomOut)}
            zoom={zoom}
          />
        }
      />
      <div
        className="w-full overflow-hidden"
        style={{
          height: Math.max(220, 60 + bays.length * (BAY_ROW_HEIGHT + 10)),
        }}
      >
        <GanttProvider
          className="h-full"
          initialDate={initialDate}
          initialDateAlignment="start"
          range="daily"
          rowHeight={BAY_ROW_HEIGHT}
          zoom={zoom}
        >
          <BayScheduleFilterScrollController request={filterScrollRequest} />
          <BayScheduleZoomAnchorController onReady={registerAnchoredZoomChange} zoom={zoom} />
          <BayScheduleSidebar bays={bays} horizonWarnings={horizonWarnings} />
          <GanttTimeline>
            <GanttHeader />
            <OffDayBands offDays={offDays} />
            <BayLaneRows bays={bays} />
            <BaySlotBars
              bays={bays}
              canEditScheduleByBayId={schedulableBayIds}
              filter={filter}
              isScheduleMutationPending={isScheduleMutationPending}
              jobsById={jobsById}
              offDays={offDays}
              onAddIdleSlot={handleAddIdleSlot}
              onRemoveSlot={handleRemoveSlot}
              onResizeSlot={handleResizeSlot}
              onSelectSlot={onSelectSlot}
              optimisticResizeDaysBySlotId={optimisticResizeDaysBySlotId}
            />
            <GanttToday className="bg-primary text-primary-foreground" />
          </GanttTimeline>
        </GanttProvider>
      </div>
    </div>
  );
};

const BayScheduleFilterScrollController: React.FC<{
  request: FilterScrollRequest | null;
}> = ({ request }) => {
  const gantt = useGanttContext();
  const scrollToDateRef = useRef(gantt.scrollToDate);

  useEffect(() => {
    scrollToDateRef.current = gantt.scrollToDate;
  }, [gantt.scrollToDate]);

  useEffect(() => {
    if (!request) {
      return;
    }

    scrollToDateRef.current?.(request.date, 'smooth');
  }, [request]);

  return null;
};

const BayScheduleZoomControls: React.FC<{
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
}> = ({ onReset, onZoomIn, onZoomOut, zoom }) => (
  <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-card px-1 py-0.5">
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Zoom out"
            disabled={zoom <= BAY_SCHEDULE_ZOOM_MIN}
            onClick={onZoomOut}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconMinus />
      </TooltipTrigger>
      <TooltipContent>Zoom out</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Reset zoom to ${BAY_SCHEDULE_ZOOM_DEFAULT}%`}
            className="w-14 tabular-nums"
            onClick={onReset}
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {zoom}%
      </TooltipTrigger>
      <TooltipContent>Reset zoom</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Zoom in"
            disabled={zoom >= BAY_SCHEDULE_ZOOM_MAX}
            onClick={onZoomIn}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconPlus />
      </TooltipTrigger>
      <TooltipContent>Zoom in</TooltipContent>
    </Tooltip>
  </div>
);

const BayScheduleZoomAnchorController: React.FC<{
  onReady: (handler: AnchoredZoomChange | null) => void;
  zoom: number;
}> = ({ onReady, zoom }) => {
  const gantt = useGanttContext();
  const ganttRef = useRef(gantt);
  const lastZoomRef = useRef(zoom);
  const pendingAnchorDateRef = useRef<Date | null>(null);
  const scrollToDateRef = useRef(gantt.scrollToDate);

  useEffect(() => {
    ganttRef.current = gantt;
    scrollToDateRef.current = gantt.scrollToDate;
  }, [gantt]);

  const applyAnchoredZoomChange = useCallback<AnchoredZoomChange>((applyZoomChange) => {
    const currentGantt = ganttRef.current;
    const scrollElement = currentGantt.ref?.current;

    if (scrollElement) {
      pendingAnchorDateRef.current = getGanttCenteredDateFromScrollLeft(
        scrollElement.scrollLeft,
        currentGantt,
        scrollElement.clientWidth,
      );
    }

    applyZoomChange();
  }, []);

  useEffect(() => {
    onReady(applyAnchoredZoomChange);

    return () => onReady(null);
  }, [applyAnchoredZoomChange, onReady]);

  useEffect(() => {
    if (lastZoomRef.current === zoom) {
      return;
    }

    lastZoomRef.current = zoom;
    const anchorDate = pendingAnchorDateRef.current;
    if (!anchorDate) {
      return;
    }

    pendingAnchorDateRef.current = null;
    scrollToDateRef.current?.(anchorDate, 'auto', 'center');
  }, [zoom]);

  return null;
};

const BayScheduleSidebar: React.FC<{
  bays: BaySchedule[];
  horizonWarnings: ReadonlyMap<string, MaintainedHorizonWarning>;
}> = ({ bays, horizonWarnings }) => {
  const now = Date.now();

  return (
    <GanttSidebar secondaryTitle={null} title="Bay">
      <div className="divide-y divide-border/50">
        {bays.map((bay) => {
          const warning = horizonWarnings.get(bay.id);
          const currentSlot = getCurrentBaySlot(bay.slots, now);
          const statusLabel = currentSlot?.kind === 'work' ? 'Busy on' : 'Idle';
          const statusValue = currentSlot?.kind === 'work' ? currentSlot.jobCode : (currentSlot?.label ?? '');

          return (
            <div
              className="flex items-center gap-3 px-3 text-xs"
              key={bay.id}
              style={{ height: 'var(--gantt-row-height)' }}
            >
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <p className="truncate text-base text-foreground leading-tight">{bay.name}</p>
                <p className="font-medium text-muted-foreground leading-none">{statusLabel}</p>
                <p className="truncate text-xs leading-tight font-mono">{statusValue}</p>
              </div>
              {warning ? <MaintainedHorizonWarningBadge warning={warning} /> : null}
            </div>
          );
        })}
      </div>
    </GanttSidebar>
  );
};

const MaintainedHorizonWarningBadge: React.FC<{
  warning: MaintainedHorizonWarning;
}> = ({ warning }) => {
  const maintainedThrough = fromJobCalendarDateKey(warning.maintainedThrough);
  const queueEndDate = fromJobCalendarDateKey(warning.queueEndDate);
  const message = `Unmaintained after ${formatDate(maintainedThrough, 'MMM d')}; projected tail may be optimistic.`;

  return (
    <div
      className="flex max-w-48 shrink-0 items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300"
      title={`Calendar ${message} Queue ends ${formatDate(queueEndDate, 'MMM d')}.`}
    >
      <IconAlertTriangle className="size-3.5 shrink-0" />
      <span className="whitespace-normal leading-tight">{message}</span>
    </div>
  );
};

const BayLaneRows: React.FC<{
  bays: BaySchedule[];
}> = ({ bays }) => (
  <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-10 w-full">
    {bays.map((bay) => (
      <div
        className="border-border/50 border-b"
        key={bay.id}
        style={{
          height: 'var(--gantt-row-height)',
        }}
      />
    ))}
  </div>
);

const getCurrentBaySlot = (slots: ProjectedJobSlot[], timestamp: number) =>
  slots.find((slot) => {
    const startAt = new Date(slot.startAt).getTime();
    const endAt = new Date(slot.endAt).getTime();

    return startAt <= timestamp && timestamp < endAt;
  }) ?? null;

const BaySlotBars: React.FC<{
  bays: BaySchedule[];
  canEditScheduleByBayId: ReadonlySet<string>;
  filter: BayScheduleFilter;
  isScheduleMutationPending: boolean;
  jobsById: ReadonlyMap<string, JobSummary>;
  offDays: OffDay[];
  onAddIdleSlot: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onRemoveSlot: (slotId: string) => Promise<void>;
  onResizeSlot: (slotId: string, durationDays: number) => void;
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
  optimisticResizeDaysBySlotId: Record<string, number>;
}> = ({
  bays,
  canEditScheduleByBayId,
  filter,
  isScheduleMutationPending,
  jobsById,
  offDays,
  onAddIdleSlot,
  onRemoveSlot,
  onResizeSlot,
  onSelectSlot,
  optimisticResizeDaysBySlotId,
}) => {
  const gantt = useGanttContext();
  const workingCalendarsByBayId = useMemo(() => createWorkingCalendarsByBayId(bays, offDays), [bays, offDays]);
  const isFilterActive = hasActiveBayScheduleFilter(filter);

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-20">
      {bays.flatMap((bay, bayIndex) =>
        bay.slots.map((slot) => (
          <BaySlotBar
            bayId={bay.id}
            canEditSchedule={canEditScheduleByBayId.has(bay.id)}
            isDimmed={isFilterActive && !slotMatchesBayScheduleFilter({ bayId: bay.id, filter, jobsById, slot })}
            isScheduleMutationPending={isScheduleMutationPending}
            job={slot.kind === 'work' ? (jobsById.get(slot.jobId) ?? null) : null}
            key={slot.id}
            onAddIdle={onAddIdleSlot}
            onRemove={onRemoveSlot}
            onResize={onResizeSlot}
            onSelectSlot={onSelectSlot}
            optimisticDurationDays={optimisticResizeDaysBySlotId[slot.id] ?? null}
            rowTop={gantt.headerHeight + bayIndex * gantt.rowHeight}
            slot={slot}
            workingCalendar={workingCalendarsByBayId.get(bay.id) ?? {}}
          />
        )),
      )}
    </div>
  );
};

type SlotResizeDrag = {
  durationDays: number;
  initialDurationDays: number;
  pixelsPerDay: number;
  startX: number;
};

const BaySlotBar: React.FC<{
  bayId: UUID;
  canEditSchedule: boolean;
  isDimmed: boolean;
  isScheduleMutationPending: boolean;
  job: JobSummary | null;
  onAddIdle: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onRemove: (slotId: string) => Promise<void>;
  onResize: (slotId: string, durationDays: number) => void;
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
  optimisticDurationDays: number | null;
  rowTop: number;
  slot: ProjectedJobSlot;
  workingCalendar: WorkingCalendar;
}> = ({
  bayId,
  canEditSchedule,
  isDimmed,
  isScheduleMutationPending,
  job,
  onAddIdle,
  onRemove,
  onResize,
  onSelectSlot,
  optimisticDurationDays,
  rowTop,
  slot,
  workingCalendar,
}) => {
  const gantt = useGanttContext();
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [resizeDrag, setResizeDrag] = useState<SlotResizeDrag | null>(null);
  const startAt = useMemo(() => new Date(slot.startAt), [slot.startAt]);
  const endAt = useMemo(() => new Date(slot.endAt), [slot.endAt]);
  const label = getSlotLabel(slot);
  const durationDays = slot.durationDays;
  const displayDurationDays = optimisticDurationDays ?? durationDays;
  const previewDurationDays = resizeDrag?.durationDays ?? displayDurationDays;
  const shouldProjectPreview = resizeDrag !== null || optimisticDurationDays !== null;
  const previewEndAt = useMemo(
    () => (shouldProjectPreview ? addJobSlotDuration(startAt, previewDurationDays, workingCalendar) : endAt),
    [endAt, previewDurationDays, shouldProjectPreview, startAt, workingCalendar],
  );
  const dayBreakdown = useMemo(
    () => summarizeSlotCalendarDays(startAt, previewEndAt, workingCalendar),
    [previewEndAt, startAt, workingCalendar],
  );
  const daySegments = useMemo(
    () => segmentSlotCalendarDays(startAt, previewEndAt, workingCalendar),
    [previewEndAt, startAt, workingCalendar],
  );
  const daySummary = formatSlotDaySummary(dayBreakdown);
  const left = getJobGanttOffset(startAt, gantt);
  const width = Math.max(getJobGanttWidth(startAt, previewEndAt, gantt), 28);
  const isIdle = slot.kind === 'idle';
  // The "active" slot is the booked job currently in progress (today within its span).
  const isActive = !isIdle && startAt.getTime() <= Date.now() && Date.now() < previewEndAt.getTime();
  const height = SLOT_CARD_HEIGHT;
  // Center the bar/card vertically within its (taller) bay row.
  const top = rowTop + (gantt.rowHeight - height) / 2;
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canEditSchedule || isScheduleMutationPending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeDrag({
      durationDays,
      initialDurationDays: durationDays,
      pixelsPerDay: getJobGanttResizeStepWidth(endAt, workingCalendar, gantt),
      startX: event.clientX,
    });
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    const deltaDays = Math.round((event.clientX - resizeDrag.startX) / resizeDrag.pixelsPerDay);
    const nextDurationDays = Math.max(1, resizeDrag.initialDurationDays + deltaDays);

    if (nextDurationDays !== resizeDrag.durationDays) {
      setResizeDrag({
        ...resizeDrag,
        durationDays: nextDurationDays,
      });
    }
  };
  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizeDrag(null);

    if (resizeDrag.durationDays !== durationDays) {
      onResize(slot.id, resizeDrag.durationDays);
    }
  };
  const cancelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizeDrag(null);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            data-gantt-drag-scroll-ignore
            className={cn(
              'pointer-events-auto absolute cursor-default overflow-hidden text-xs shadow-sm transition-opacity duration-200',
              isIdle
                ? 'rounded-sm border border-border bg-card px-2 py-1 text-muted-foreground'
                : cn(
                    'rounded-lg border bg-card px-2.5 py-1.5 text-card-foreground',
                    isActive ? 'border-white/70 ring-1 ring-white/25' : 'border-border',
                  ),
              // Filtered-out slots fade back but stay interactive; hover restores them.
              isDimmed && 'opacity-20 hover:opacity-100',
            )}
            style={{
              height,
              left,
              top,
              width,
            }}
            title={`${label}: ${formatDate(slot.startAt, 'long')} - ${formatDate(slot.endAt, 'long')}\n${dayBreakdown.workingDays} working day(s), ${dayBreakdown.closureDays} closure day(s), ${dayBreakdown.overtimeDays} overtime day(s)`}
          />
        }
      >
        {isIdle ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: IDLE_SLOT_HATCH_BACKGROUND }}
          />
        ) : (
          <BaySlotDayHatch segments={daySegments} slotStart={startAt} />
        )}
        {isIdle ? (
          <span className="relative z-10 flex h-full items-center gap-1.5 pr-8">
            <span className="min-w-0 truncate font-medium">{label}</span>
            <span className="shrink-0 text-[0.65rem] tabular-nums opacity-80">{daySummary}</span>
          </span>
        ) : (
          <button
            className="relative z-10 block h-full w-full cursor-pointer pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={!job}
            onClick={() => {
              if (job) {
                onSelectSlot?.(job.id, bayId);
              }
            }}
            type="button"
          >
            <BaySlotJobCard dayBreakdown={dayBreakdown} job={job} jobCode={label} />
          </button>
        )}
        {canEditSchedule ? (
          <>
            <Dialog onOpenChange={setIsRemoveDialogOpen} open={isRemoveDialogOpen}>
              <DialogTrigger
                render={
                  <button
                    aria-label={`Remove ${label}`}
                    className={cn(
                      'absolute top-1/2 right-2 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm bg-card/80 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                      'hover:bg-destructive hover:text-white focus-visible:ring-ring',
                    )}
                    disabled={isScheduleMutationPending || isRemoving}
                    type="button"
                  />
                }
              >
                <IconTrash className="size-3.5" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove slot</DialogTitle>
                  <DialogDescription>
                    Remove {label} from the Bay schedule. Later Slots will move up to close the gap.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button disabled={isRemoving} type="button" variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button
                    disabled={isRemoving}
                    onClick={async () => {
                      setIsRemoving(true);
                      try {
                        await onRemove(slot.id);
                        setIsRemoveDialogOpen(false);
                      } catch {
                        // The mutation hook owns the user-facing error toast.
                      } finally {
                        setIsRemoving(false);
                      }
                    }}
                    type="button"
                    variant="destructive"
                  >
                    {isRemoving ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
                    Remove
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <button
              aria-label={`Resize ${label}`}
              className={cn(
                'absolute top-0 right-0 h-full w-2 cursor-ew-resize border-r-2 outline-none disabled:cursor-not-allowed disabled:opacity-50',
                isIdle
                  ? 'border-foreground/40 bg-foreground/10 hover:bg-foreground/15 focus-visible:ring-2 focus-visible:ring-foreground'
                  : 'border-foreground/30 bg-foreground/5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring',
              )}
              disabled={isScheduleMutationPending || isRemoving}
              onPointerCancel={cancelResize}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishResize}
              type="button"
            />
          </>
        ) : null}
      </ContextMenuTrigger>
      {canEditSchedule ? (
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem disabled={isScheduleMutationPending} onClick={() => onAddIdle(slot.id, 'before')}>
              <IconClockPlus />
              Add idle slot before
            </ContextMenuItem>
            <ContextMenuItem disabled={isScheduleMutationPending} onClick={() => onAddIdle(slot.id, 'after')}>
              <IconClockPlus />
              Add idle slot after
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
};

// Total working days, with closure and overtime days called out in brackets
// (each only shown when non-zero), e.g. "5d (2 closed, 1 OT)".
function formatSlotDaySummary({ workingDays, closureDays, overtimeDays }: SlotCalendarDays): string {
  const extras: string[] = [];

  if (closureDays > 0) {
    extras.push(`${closureDays} closed`);
  }

  if (overtimeDays > 0) {
    extras.push(`${overtimeDays} OT`);
  }

  const days = `${workingDays}d`;
  return extras.length > 0 ? `${days} (${extras.join(', ')})` : days;
}
