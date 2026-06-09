import {
  addJobSlotDuration,
  formatDate,
  type SlotCalendarDays,
  segmentSlotCalendarDays,
  summarizeSlotCalendarDays,
  type WorkingCalendar,
} from '@pkg/domain';
import type {
  BaySchedule,
  JobListInput,
  JobSlotPlacement,
  JobSummary,
  OffDay,
  ProjectedJobSlot,
  UUID,
} from '@pkg/schema';
import { IconAlertTriangle, IconCalendarPlus, IconClockPlus, IconLoader2, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import {
  GanttHeader,
  GanttProvider,
  GanttSidebar,
  GanttTimeline,
  GanttToday,
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
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { OffDayBands } from './BayCalendarOverlays.js';
import { BaySlotDayHatch, BaySlotJobCard } from './BaySlotJobCard.js';
import { createWorkingCalendarsByBayId, getSlotLabel } from './bay-schedule-summary.js';
import { fromJobCalendarDateKey } from './job-date-key.js';
import { getJobGanttOffset, getJobGanttResizeStepWidth, getJobGanttWidth } from './job-gantt-geometry.js';
import { getMaintainedHorizonWarnings, type MaintainedHorizonWarning } from './maintained-horizon.js';

// Taller rows give each booked slot room for the rich job card (thumbnails + details).
const BAY_ROW_HEIGHT = 72;
// Slot card height, leaving a small inset above/below within the row.
const SLOT_CARD_HEIGHT = 60;
const IDLE_SLOT_HATCH_BACKGROUND =
  'repeating-linear-gradient(45deg, rgb(113 113 122 / 0.18) 0 5px, transparent 5px 10px)';

const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;

export const BayScheduleGantt: React.FC<{
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
}> = ({ onSelectSlot }) => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));
  const bays = baysQuery.data?.items ?? [];
  const offDays = baysQuery.data?.offDays ?? [];
  const horizonWarnings = useMemo(
    () => new Map(getMaintainedHorizonWarnings({ bays, offDays }).map((warning) => [warning.bayId, warning])),
    [bays, offDays],
  );
  const initialDate = useMemo(() => new Date(), []);
  const [selectedBayId, setSelectedBayId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [hoveredBayId, setHoveredBayId] = useState<string | null>(null);
  const [optimisticResizeDaysBySlotId, setOptimisticResizeDaysBySlotId] = useState<Record<string, number>>({});
  const selectedBay = bays.find((bay) => bay.id === selectedBayId) ?? bays[0] ?? null;
  const jobs = jobsQuery.data?.items ?? [];
  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedStage = selectedBay
    ? (selectedJob?.stages.find((stage) => stage.stage === selectedBay.department) ?? null)
    : null;
  const canBook = Boolean(selectedBay && selectedStage && durationDays > 0);
  const clearOptimisticResize = useCallback((slotId: string) => {
    setOptimisticResizeDaysBySlotId((current) => {
      const { [slotId]: _removed, ...next } = current;
      return next;
    });
  }, []);
  const bookSlotMutation = useMutation(
    trpc.jobs.bookSlot.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Job booked');
      },
      onError: (error) => showMutationError(error, 'Unable to book job.'),
    }),
  );
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
    bookSlotMutation.isPending ||
    resizeSlotMutation.isPending ||
    removeSlotMutation.isPending ||
    addIdleSlotMutation.isPending;
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
  useEffect(() => {
    if (!selectedBayId && bays[0]) {
      setSelectedBayId(bays[0].id);
    }
  }, [bays, selectedBayId]);

  useEffect(() => {
    if (!selectedJobId && jobs[0]) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

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
      <form
        className="flex flex-wrap items-end gap-3 border-border/70 border-y bg-background py-3"
        onSubmit={(event) => {
          event.preventDefault();

          if (!selectedBay || !selectedStage || durationDays <= 0) {
            return;
          }

          bookSlotMutation.mutate({
            bayId: selectedBay.id,
            durationDays,
            jobStageId: selectedStage.id,
          });
        }}
      >
        <Field className="min-w-56 max-w-72 flex-1 gap-1">
          <FieldLabel htmlFor="bay-schedule-bay">Bay</FieldLabel>
          <Select onValueChange={(value) => setSelectedBayId(String(value))} value={selectedBay?.id ?? ''}>
            <SelectTrigger id="bay-schedule-bay" className="w-full">
              <SelectValue placeholder="Select bay">
                {selectedBay ? (
                  <>
                    <span className="truncate">{selectedBay.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatDate(selectedBay.nextAvailableAt, 'MMM d')}
                    </span>
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {bays.map((bay) => (
                  <SelectItem key={bay.id} value={bay.id}>
                    {bay.name}
                    <span className="text-muted-foreground">{formatDate(bay.nextAvailableAt, 'MMM d')}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="min-w-64 max-w-96 flex-1 gap-1">
          <FieldLabel htmlFor="bay-schedule-job">Job</FieldLabel>
          <Select
            disabled={jobsQuery.isLoading}
            onValueChange={(value) => setSelectedJobId(String(value))}
            value={selectedJob?.id ?? ''}
          >
            <SelectTrigger id="bay-schedule-job" className="w-full">
              <SelectValue placeholder={jobsQuery.isLoading ? 'Loading jobs' : 'Select job'}>
                {selectedJob ? (
                  <>
                    <span className="truncate">{selectedJob.code}</span>
                    <span className="shrink-0 text-muted-foreground">{selectedJob.productSerialNumber}</span>
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.code}
                    <span className="text-muted-foreground">{job.productSerialNumber}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-28 gap-1">
          <FieldLabel htmlFor="bay-schedule-duration">Days</FieldLabel>
          <Input
            id="bay-schedule-duration"
            min={1}
            onChange={(event) => setDurationDays(Number.parseInt(event.currentTarget.value, 10) || 0)}
            type="number"
            value={durationDays}
          />
        </Field>
        <Button disabled={!canBook || isScheduleMutationPending} type="submit">
          {bookSlotMutation.isPending ? (
            <IconLoader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <IconCalendarPlus data-icon="inline-start" />
          )}
          Book
        </Button>
      </form>
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
          zoom={200}
        >
          <BayScheduleSidebar
            bays={bays}
            horizonWarnings={horizonWarnings}
            hoveredBayId={hoveredBayId}
            onHoverBay={setHoveredBayId}
          />
          <GanttTimeline>
            <GanttHeader />
            <OffDayBands offDays={offDays} />
            <BayLaneRows bays={bays} hoveredBayId={hoveredBayId} onHoverBay={setHoveredBayId} />
            <BaySlotBars
              bays={bays}
              isScheduleMutationPending={isScheduleMutationPending}
              jobsById={jobsById}
              offDays={offDays}
              onAddIdleSlot={handleAddIdleSlot}
              onHoverBay={setHoveredBayId}
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

const BayScheduleSidebar: React.FC<{
  bays: BaySchedule[];
  horizonWarnings: ReadonlyMap<string, MaintainedHorizonWarning>;
  hoveredBayId: string | null;
  onHoverBay: (bayId: string | null) => void;
}> = ({ bays, horizonWarnings, hoveredBayId, onHoverBay }) => {
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
              className={cn(
                'flex items-center gap-3 px-3 text-xs transition-colors',
                hoveredBayId === bay.id && 'bg-muted/45',
              )}
              key={bay.id}
              onPointerEnter={() => onHoverBay(bay.id)}
              onPointerLeave={() => onHoverBay(null)}
              style={{ height: 'var(--gantt-row-height)' }}
            >
              <div className="flex min-w-40 flex-1 flex-col gap-1">
                <p className="truncate text-base text-foreground leading-tight">{bay.name}</p>
                <p className="font-medium text-muted-foreground leading-none">{statusLabel}</p>
                <p className="truncate text-xs leading-tight">{statusValue}</p>
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
  hoveredBayId: string | null;
  onHoverBay: (bayId: string | null) => void;
}> = ({ bays, hoveredBayId, onHoverBay }) => (
  <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-10 w-full">
    {bays.map((bay) => (
      <div
        className={cn(
          'pointer-events-auto border-border/50 border-b transition-colors',
          hoveredBayId === bay.id && 'bg-muted/30',
        )}
        key={bay.id}
        onPointerEnter={() => onHoverBay(bay.id)}
        onPointerLeave={() => onHoverBay(null)}
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
  isScheduleMutationPending: boolean;
  jobsById: ReadonlyMap<string, JobSummary>;
  offDays: OffDay[];
  onAddIdleSlot: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onHoverBay: (bayId: string | null) => void;
  onRemoveSlot: (slotId: string) => Promise<void>;
  onResizeSlot: (slotId: string, durationDays: number) => void;
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
  optimisticResizeDaysBySlotId: Record<string, number>;
}> = ({
  bays,
  isScheduleMutationPending,
  jobsById,
  offDays,
  onAddIdleSlot,
  onHoverBay,
  onRemoveSlot,
  onResizeSlot,
  onSelectSlot,
  optimisticResizeDaysBySlotId,
}) => {
  const gantt = useGanttContext();
  const workingCalendarsByBayId = useMemo(() => createWorkingCalendarsByBayId(bays, offDays), [bays, offDays]);

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-20">
      {bays.flatMap((bay, bayIndex) =>
        bay.slots.map((slot) => (
          <BaySlotBar
            bayId={bay.id}
            isScheduleMutationPending={isScheduleMutationPending}
            job={slot.kind === 'work' ? (jobsById.get(slot.jobId) ?? null) : null}
            key={slot.id}
            onAddIdle={onAddIdleSlot}
            onHoverBay={onHoverBay}
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
  isScheduleMutationPending: boolean;
  job: JobSummary | null;
  onAddIdle: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onHoverBay: (bayId: string | null) => void;
  onRemove: (slotId: string) => Promise<void>;
  onResize: (slotId: string, durationDays: number) => void;
  onSelectSlot?: ((jobId: UUID, bayId: UUID) => void) | undefined;
  optimisticDurationDays: number | null;
  rowTop: number;
  slot: ProjectedJobSlot;
  workingCalendar: WorkingCalendar;
}> = ({
  bayId,
  isScheduleMutationPending,
  job,
  onAddIdle,
  onHoverBay,
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
    if (isScheduleMutationPending) {
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
              'pointer-events-auto absolute cursor-default overflow-hidden text-xs shadow-sm',
              isIdle
                ? 'rounded-sm border border-border bg-card px-2 py-1 text-muted-foreground'
                : cn(
                    'rounded-lg border bg-card px-2.5 py-1.5 text-card-foreground',
                    isActive ? 'border-white/70 ring-1 ring-white/25' : 'border-border',
                  ),
            )}
            style={{
              height,
              left,
              top,
              width,
            }}
            onPointerEnter={() => onHoverBay(bayId)}
            onPointerLeave={() => onHoverBay(null)}
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
      </ContextMenuTrigger>
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
