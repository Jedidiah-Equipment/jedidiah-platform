import { formatDate, hasPermission } from '@pkg/domain';
import type {
  BaySchedule,
  DateOnlyIso,
  JobSlotMoveDirection,
  JobSlotPlacement,
  JobSummary,
  OffDay,
  ProjectedJobSlot,
  UUID,
} from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BayOperatorIndicator } from '@/components/bays/index.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import {
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttTimeline,
  GanttToday,
  useGanttContext,
} from '@/components/kibo-ui/gantt/index.js';
import { PageLayoutFullscreenToggle } from '@/components/page-layout/PageLayoutFullscreenToggle.js';
import { Card, CardContent, CardHeader, CardSeparator } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { allJobsInput } from './all-jobs-input.js';
import { OffDayBands } from './BayCalendarOverlays.js';
import { BayScheduleFilterBar } from './BayScheduleFilterBar.js';
import { BayScheduleGhostBars } from './BayScheduleGhostBars.js';
import {
  type AnchoredZoomChange,
  BayScheduleZoomAnchorController,
  BayScheduleZoomControls,
} from './BayScheduleZoom.js';
import { BaySlotBar } from './BaySlotBar.js';
import { moveBaySlotForDisplay } from './bay-schedule-display-move.js';
import {
  type BayScheduleFilter,
  countBayScheduleFilterMatches,
  emptyBayScheduleFilter,
  getEarliestBayScheduleFilterMatchStart,
  hasActiveBayScheduleFilter,
  slotMatchesBayScheduleFilter,
} from './bay-schedule-filter.js';
import {
  type BayScheduleGhostSeed,
  type DisplayBaySchedule,
  deriveGhostBaySchedules,
  selectVisibleBaySchedules,
} from './bay-schedule-ghosts.js';
import { createWorkingCalendarsByBayId } from './bay-schedule-summary.js';
import { useBayScheduleViewStore } from './bay-schedule-view-store.js';
import { fromJobCalendarDateKey } from './job-date-key.js';
import { getMaintainedHorizonWarnings, type MaintainedHorizonWarning } from './maintained-horizon.js';

// Taller rows give each booked slot room for the rich job card (thumbnails + details).
const BAY_ROW_HEIGHT = 72;

type FilterScrollRequest = {
  date: Date;
  id: number;
};

export const BayScheduleGantt: React.FC<{
  /** Embedded in another surface (e.g. the Start Job page): hides the filter bar; zoom controls remain. */
  embedded?: boolean;
  fullscreen?: boolean;
  /** Bar label for ghost slots, e.g. the source Quote code. */
  ghostLabel?: string | undefined;
  /** Client-only preview seeds; ghost derivation runs inside against the live query. */
  ghostSeeds?: readonly BayScheduleGhostSeed[] | undefined;
  onFullscreenChange?: ((fullscreen: boolean) => void) | undefined;
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
  /** When set, only these Bays render as lanes, sorted into Department pipeline order. */
  visibleBayIds?: readonly UUID[] | undefined;
}> = ({
  embedded = false,
  fullscreen = false,
  ghostLabel,
  ghostSeeds,
  onFullscreenChange,
  onSelectSlot,
  visibleBayIds,
}) => {
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
    () => bays.filter((bay) => enabledBayIds.has(bay.id) && hasPermission(accessQuery.data, 'job:schedule')),
    [accessQuery.data, bays, enabledBayIds],
  );
  const schedulableBayIds = useMemo(() => new Set(schedulableBays.map((bay) => bay.id)), [schedulableBays]);
  const offDays = baysQuery.data?.offDays ?? [];
  const plantToday = baysQuery.data?.today ?? null;
  const horizonWarnings = useMemo(
    () => new Map(getMaintainedHorizonWarnings({ bays, offDays }).map((warning) => [warning.bayId, warning])),
    [bays, offDays],
  );
  // One scheduling "today" for the whole surface: the view opens on the plant's current day.
  const initialDate = useMemo(() => (plantToday ? fromJobCalendarDateKey(plantToday) : new Date()), [plantToday]);
  const [optimisticBays, setOptimisticBays] = useState<BaySchedule[] | null>(null);
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
  const displayedBays = optimisticBays ?? bays;
  // Render pipeline: query → optimistic-move overlay → lane filter → ghost derivation.
  // Mutations and optimistic moves always operate on the un-ghosted bays.
  const visibleBays = useMemo(
    () => selectVisibleBaySchedules(displayedBays, visibleBayIds),
    [displayedBays, visibleBayIds],
  );
  const ghostDerivation = useMemo(
    () =>
      ghostSeeds && plantToday
        ? deriveGhostBaySchedules({ bays: visibleBays, offDays, seeds: ghostSeeds, today: plantToday })
        : null,
    [ghostSeeds, offDays, plantToday, visibleBays],
  );
  const renderedBays: DisplayBaySchedule[] = ghostDerivation?.bays ?? visibleBays;
  const isFilterActive = hasActiveBayScheduleFilter(filter);
  const filterMatchCount = useMemo(
    () => (isFilterActive ? countBayScheduleFilterMatches({ bays: displayedBays, filter, jobsById }) : 0),
    [displayedBays, filter, isFilterActive, jobsById],
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
  const moveSlotMutation = useMutation(
    trpc.jobs.moveSlot.mutationOptions({
      onSuccess: async () => {
        try {
          await invalidateJobs();
          toast.success('Slot moved');
        } finally {
          setOptimisticBays(null);
        }
      },
      onError: (error) => {
        setOptimisticBays(null);
        showMutationError(error, 'Unable to move slot.');
      },
    }),
  );
  const isScheduleMutationPending =
    resizeSlotMutation.isPending ||
    removeSlotMutation.isPending ||
    addIdleSlotMutation.isPending ||
    moveSlotMutation.isPending;
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
  const handleMoveSlot = useCallback(
    (slotId: string, direction: JobSlotMoveDirection) => {
      setOptimisticBays(moveBaySlotForDisplay(displayedBays, offDays, slotId, direction));
      moveSlotMutation.mutate({ direction, slotId });
    },
    [displayedBays, moveSlotMutation, offDays],
  );
  const handleFilterChange = useCallback(
    (nextFilter: BayScheduleFilter) => {
      setFilter(nextFilter);

      if (!hasActiveBayScheduleFilter(nextFilter)) {
        setFilterScrollRequest(null);
        return;
      }

      const targetStart = plantToday
        ? getEarliestBayScheduleFilterMatchStart({
            bays: displayedBays,
            filter: nextFilter,
            jobsById,
            today: plantToday,
          })
        : null;

      setFilterScrollRequest((current) =>
        targetStart
          ? {
              date: fromJobCalendarDateKey(targetStart),
              id: (current?.id ?? 0) + 1,
            }
          : null,
      );
    },
    [displayedBays, jobsById, plantToday],
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

  if (renderedBays.length === 0 || !plantToday) {
    return null;
  }

  const trailingControls = (
    <div className="flex items-center gap-2">
      {onFullscreenChange ? (
        <PageLayoutFullscreenToggle fullscreen={fullscreen} onFullscreenChange={onFullscreenChange} />
      ) : null}
      <BayScheduleZoomControls
        onReset={() => applyAnchoredZoomChange(resetZoom)}
        onZoomIn={() => applyAnchoredZoomChange(zoomIn)}
        onZoomOut={() => applyAnchoredZoomChange(zoomOut)}
        zoom={zoom}
      />
    </div>
  );

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="block pb-4">
        {embedded ? (
          <div className="flex justify-end">{trailingControls}</div>
        ) : (
          <BayScheduleFilterBar
            bays={bays}
            filter={filter}
            jobs={jobs}
            noMatches={isFilterActive && filterMatchCount === 0}
            onFilterChange={handleFilterChange}
            trailingContent={trailingControls}
          />
        )}
      </CardHeader>
      <CardSeparator />
      <CardContent className="p-0">
        <div
          className="w-full overflow-hidden"
          style={{
            height: Math.max(220, 60 + renderedBays.length * (BAY_ROW_HEIGHT + 10)),
          }}
        >
          <GanttProvider
            className="h-full rounded-none border-0 bg-transparent"
            initialDate={initialDate}
            initialDateAlignment="start"
            range="daily"
            rowHeight={BAY_ROW_HEIGHT}
            zoom={zoom}
          >
            <BayScheduleFilterScrollController request={filterScrollRequest} />
            <BayScheduleZoomAnchorController onReady={registerAnchoredZoomChange} zoom={zoom} />
            <BayScheduleSidebar bays={renderedBays} horizonWarnings={horizonWarnings} today={plantToday} />
            <GanttTimeline>
              <GanttHeader />
              <OffDayBands offDays={offDays} />
              <BayLaneRows bays={renderedBays} />
              <BaySlotBars
                bays={renderedBays}
                canEditScheduleByBayId={schedulableBayIds}
                today={plantToday}
                filter={filter}
                isScheduleMutationPending={isScheduleMutationPending}
                jobsById={jobsById}
                offDays={offDays}
                onAddIdleSlot={handleAddIdleSlot}
                onMoveSlot={handleMoveSlot}
                onRemoveSlot={handleRemoveSlot}
                onResizeSlot={handleResizeSlot}
                onSelectSlot={onSelectSlot}
                optimisticResizeDaysBySlotId={optimisticResizeDaysBySlotId}
              />
              {ghostDerivation && ghostDerivation.ghosts.length > 0 ? (
                <BayScheduleGhostBars
                  bays={renderedBays}
                  ghosts={ghostDerivation.ghosts}
                  label={ghostLabel ?? 'New Job'}
                />
              ) : null}
              <GanttToday className="bg-primary text-primary-foreground" />
            </GanttTimeline>
          </GanttProvider>
        </div>
      </CardContent>
    </Card>
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

const BayScheduleSidebar: React.FC<{
  bays: BaySchedule[];
  horizonWarnings: ReadonlyMap<string, MaintainedHorizonWarning>;
  /** Plant business date from the schedule read — busy/idle is plant state, not viewer-local. */
  today: DateOnlyIso;
}> = ({ bays, horizonWarnings, today }) => {
  return (
    <GanttSidebar secondaryTitle={null} title="Bay">
      <div className="divide-y divide-border/50">
        {bays.map((bay) => {
          const warning = horizonWarnings.get(bay.id);
          const currentSlot = getCurrentBaySlot(bay.slots, today);
          const statusText =
            currentSlot?.kind === 'work'
              ? `Busy on ${currentSlot.jobCode}`
              : ['Idle', currentSlot?.label].filter(Boolean).join(' ');

          return (
            <div
              className="flex items-center gap-3 px-3 text-xs"
              key={bay.id}
              style={{ height: 'var(--gantt-row-height)' }}
            >
              <BayOperatorIndicator operator={bay.currentOperator} />
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <p className="truncate text-base text-foreground leading-tight">{bay.name}</p>
                <p className="truncate font-mono text-muted-foreground text-xs leading-tight">{statusText}</p>
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
  const message = `Unmaintained after ${formatDate(warning.maintainedThrough, 'MMM d')}; projected tail may be optimistic.`;

  return (
    <div
      className="flex max-w-48 shrink-0 items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300"
      title={`Calendar ${message} Queue ends ${formatDate(warning.queueEndDate, 'MMM d')}.`}
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

const getCurrentBaySlot = (slots: ProjectedJobSlot[], today: DateOnlyIso) =>
  slots.find((slot) => slot.startDate <= today && today < slot.endDate) ?? null;

const BaySlotBars: React.FC<{
  bays: DisplayBaySchedule[];
  canEditScheduleByBayId: ReadonlySet<string>;
  today: DateOnlyIso;
  filter: BayScheduleFilter;
  isScheduleMutationPending: boolean;
  jobsById: ReadonlyMap<string, JobSummary>;
  offDays: OffDay[];
  onAddIdleSlot: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onMoveSlot: (slotId: string, direction: JobSlotMoveDirection) => void;
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
  onMoveSlot,
  onRemoveSlot,
  onResizeSlot,
  onSelectSlot,
  optimisticResizeDaysBySlotId,
  today,
}) => {
  const gantt = useGanttContext();
  const workingCalendarsByBayId = useMemo(() => createWorkingCalendarsByBayId(bays, offDays), [bays, offDays]);
  const isFilterActive = hasActiveBayScheduleFilter(filter);

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-20">
      {bays.flatMap((bay, bayIndex) =>
        bay.slots.map((slot, slotIndex) => (
          <BaySlotBar
            bayId={bay.id}
            // Split halves carry synthetic ids that must never reach a mutation.
            canEditSchedule={canEditScheduleByBayId.has(bay.id) && !slot.previewSplit}
            isDimmed={isFilterActive && !slotMatchesBayScheduleFilter({ bayId: bay.id, filter, jobsById, slot })}
            isScheduleMutationPending={isScheduleMutationPending}
            job={slot.kind === 'work' ? (jobsById.get(slot.jobId) ?? null) : null}
            key={slot.id}
            onAddIdle={onAddIdleSlot}
            onMove={onMoveSlot}
            onRemove={onRemoveSlot}
            onResize={onResizeSlot}
            onSelectSlot={onSelectSlot}
            optimisticDurationDays={optimisticResizeDaysBySlotId[slot.id] ?? null}
            rowTop={gantt.headerHeight + bayIndex * gantt.rowHeight}
            slot={slot}
            slotIndex={slotIndex}
            slotCount={bay.slots.length}
            today={today}
            workingCalendar={workingCalendarsByBayId.get(bay.id) ?? {}}
          />
        )),
      )}
    </div>
  );
};
