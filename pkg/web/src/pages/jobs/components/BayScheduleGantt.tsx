import {
  addJobSlotDuration,
  DEFAULT_IDLE_SLOT_LABEL,
  formatDate,
  hasPermission,
  type WorkingCalendar,
} from '@pkg/domain';
import type {
  BayCalendarException,
  BayCalendarExceptionDirection,
  BaySchedule,
  JobListInput,
  JobSlotPlacement,
  OffDay,
  ProjectedJobSlot,
} from '@pkg/schema';
import {
  IconAlertTriangle,
  IconCalendarPlus,
  IconClockPlus,
  IconLoader2,
  IconMoon,
  IconSun,
  IconTrash,
} from '@tabler/icons-react';
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
  getGanttOffset,
  getGanttWidth,
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
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { BayCalendarExceptionContextMenu, BayExceptionBands, OffDayBands } from './BayCalendarOverlays.js';
import { fromJobCalendarDateKey } from './job-date-key.js';
import { getMaintainedHorizonWarnings, type MaintainedHorizonWarning } from './maintained-horizon.js';

const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;

type BayExceptionDialogState = {
  bayId: string;
  date: string;
  direction: BayCalendarExceptionDirection;
  existingException: BayCalendarException | null;
  label: string;
};

export const BayScheduleGantt: React.FC = () => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const accessQuery = useAccess();
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
  const [bayExceptionDialog, setBayExceptionDialog] = useState<BayExceptionDialogState | null>(null);
  const [optimisticResizeDaysBySlotId, setOptimisticResizeDaysBySlotId] = useState<Record<string, number>>({});
  const selectedBay = bays.find((bay) => bay.id === selectedBayId) ?? bays[0] ?? null;
  const selectedExceptionBay = bayExceptionDialog
    ? (bays.find((bay) => bay.id === bayExceptionDialog.bayId) ?? null)
    : null;
  const jobs = jobsQuery.data?.items ?? [];
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedStage = selectedBay
    ? (selectedJob?.stages.find((stage) => stage.stage === selectedBay.department) ?? null)
    : null;
  const canBook = Boolean(selectedBay && selectedStage && durationDays > 0);
  const canEditSchedule =
    hasPermission(accessQuery.data, 'job:update') || hasPermission(accessQuery.data, 'job-stage:update');
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
  const addBayExceptionMutation = useMutation(
    trpc.jobs.addBayException.mutationOptions({
      onSuccess: async (_result, variables) => {
        await invalidateJobs();
        toast.success(variables.direction === 'work' ? 'Bay overtime saved' : 'Bay closure saved');
        setBayExceptionDialog(null);
      },
      onError: (error) => showMutationError(error, 'Unable to update Bay calendar.'),
    }),
  );
  const removeBayExceptionMutation = useMutation(
    trpc.jobs.removeBayException.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Bay exception removed');
        setBayExceptionDialog(null);
      },
      onError: (error) => showMutationError(error, 'Unable to remove Bay exception.'),
    }),
  );
  const isScheduleMutationPending =
    bookSlotMutation.isPending ||
    resizeSlotMutation.isPending ||
    removeSlotMutation.isPending ||
    addIdleSlotMutation.isPending ||
    addBayExceptionMutation.isPending ||
    removeBayExceptionMutation.isPending;
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
  const handleOpenBayExceptionDialog = useCallback(
    ({ bayId, date, direction }: Pick<BayExceptionDialogState, 'bayId' | 'date' | 'direction'>) => {
      const bay = bays.find((item) => item.id === bayId);
      const existingException = bay?.calendarExceptions.find((exception) => exception.date === date) ?? null;

      setBayExceptionDialog({
        bayId,
        date,
        direction,
        existingException,
        label: existingException?.label ?? '',
      });
    },
    [bays],
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
          height: Math.max(220, 60 + bays.length * 46),
        }}
      >
        <GanttProvider
          className="h-full border border-border/70 bg-background"
          initialDate={initialDate}
          initialDateAlignment="start"
          range="daily"
          zoom={200}
        >
          <BayScheduleSidebar bays={bays} horizonWarnings={horizonWarnings} />
          <GanttTimeline>
            <GanttHeader />
            <OffDayBands offDays={offDays} />
            <BayExceptionBands bays={bays} />
            <BayLaneDividers bays={bays} />
            <BayCalendarExceptionContextMenu
              bays={bays}
              canEditSchedule={canEditSchedule}
              isScheduleMutationPending={isScheduleMutationPending}
              onOpenDialog={handleOpenBayExceptionDialog}
            />
            <BaySlotBars
              bays={bays}
              isScheduleMutationPending={isScheduleMutationPending}
              offDays={offDays}
              onAddIdleSlot={handleAddIdleSlot}
              onRemoveSlot={handleRemoveSlot}
              onResizeSlot={handleResizeSlot}
              optimisticResizeDaysBySlotId={optimisticResizeDaysBySlotId}
            />
            <GanttToday className="bg-primary text-primary-foreground" />
          </GanttTimeline>
        </GanttProvider>
      </div>
      <Dialog onOpenChange={(open) => !open && setBayExceptionDialog(null)} open={bayExceptionDialog !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bayExceptionDialog?.direction === 'work' ? 'Add bay overtime' : 'Add bay closure'}
            </DialogTitle>
            <DialogDescription>
              {bayExceptionDialog ? formatDate(fromJobCalendarDateKey(bayExceptionDialog.date), 'PPP') : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="bay-exception-bay">Bay</FieldLabel>
              <Select
                disabled={isScheduleMutationPending}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }

                  setBayExceptionDialog((current) => {
                    if (!current) return current;

                    const bay = bays.find((item) => item.id === value);
                    const existingException =
                      bay?.calendarExceptions.find((exception) => exception.date === current.date) ?? null;

                    return {
                      ...current,
                      bayId: value,
                      existingException,
                      label: existingException?.label ?? '',
                    };
                  });
                }}
                value={bayExceptionDialog?.bayId ?? ''}
              >
                <SelectTrigger id="bay-exception-bay" className="w-full">
                  <SelectValue placeholder="Select bay">{selectedExceptionBay?.name ?? null}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {bays.map((bay) => (
                      <SelectItem key={bay.id} value={bay.id}>
                        {bay.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="bay-exception-label">Reason</FieldLabel>
              <Input
                disabled={isScheduleMutationPending}
                id="bay-exception-label"
                onChange={(event) =>
                  setBayExceptionDialog((current) =>
                    current ? { ...current, label: event.currentTarget.value } : current,
                  )
                }
                value={bayExceptionDialog?.label ?? ''}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose render={<Button disabled={isScheduleMutationPending} type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            {bayExceptionDialog?.existingException ? (
              <Button
                disabled={isScheduleMutationPending}
                onClick={() => {
                  if (!bayExceptionDialog) return;

                  removeBayExceptionMutation.mutate({
                    bayId: bayExceptionDialog.bayId,
                    date: bayExceptionDialog.date,
                  });
                }}
                type="button"
                variant="outline"
              >
                {removeBayExceptionMutation.isPending ? (
                  <IconLoader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <IconTrash data-icon="inline-start" />
                )}
                Remove exception
              </Button>
            ) : null}
            <Button
              disabled={isScheduleMutationPending || !bayExceptionDialog}
              onClick={() => {
                if (!bayExceptionDialog) return;

                addBayExceptionMutation.mutate({
                  bayId: bayExceptionDialog.bayId,
                  date: bayExceptionDialog.date,
                  direction: bayExceptionDialog.direction,
                  label: bayExceptionDialog.label,
                });
              }}
              type="button"
            >
              {addBayExceptionMutation.isPending ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : bayExceptionDialog?.direction === 'work' ? (
                <IconSun data-icon="inline-start" />
              ) : (
                <IconMoon data-icon="inline-start" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const BayScheduleSidebar: React.FC<{
  bays: BaySchedule[];
  horizonWarnings: ReadonlyMap<string, MaintainedHorizonWarning>;
}> = ({ bays, horizonWarnings }) => (
  <GanttSidebar secondaryTitle={null} title="Bay">
    <div className="divide-y divide-border/50">
      {bays.map((bay) => {
        const warning = horizonWarnings.get(bay.id);

        return (
          <div
            className="flex items-center gap-2 px-2.5 text-xs"
            key={bay.id}
            style={{ height: 'var(--gantt-row-height)' }}
          >
            <p className="min-w-0 flex-1 truncate font-medium">{bay.name}</p>
            {warning ? <MaintainedHorizonWarningBadge warning={warning} /> : null}
          </div>
        );
      })}
    </div>
  </GanttSidebar>
);

const MaintainedHorizonWarningBadge: React.FC<{
  warning: MaintainedHorizonWarning;
}> = ({ warning }) => {
  const maintainedThrough = fromJobCalendarDateKey(warning.maintainedThrough);
  const queueEndDate = fromJobCalendarDateKey(warning.queueEndDate);
  const message = `Unmaintained after ${formatDate(maintainedThrough, 'MMM d')}; projected tail may be optimistic.`;

  return (
    <div
      className="flex max-w-[12rem] shrink-0 items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300"
      title={`Calendar ${message} Queue ends ${formatDate(queueEndDate, 'MMM d')}.`}
    >
      <IconAlertTriangle className="size-3.5 shrink-0" />
      <span className="whitespace-normal leading-tight">{message}</span>
    </div>
  );
};

const BayLaneDividers: React.FC<{
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

const BaySlotBars: React.FC<{
  bays: BaySchedule[];
  isScheduleMutationPending: boolean;
  offDays: OffDay[];
  onAddIdleSlot: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onRemoveSlot: (slotId: string) => Promise<void>;
  onResizeSlot: (slotId: string, durationDays: number) => void;
  optimisticResizeDaysBySlotId: Record<string, number>;
}> = ({
  bays,
  isScheduleMutationPending,
  offDays,
  onAddIdleSlot,
  onRemoveSlot,
  onResizeSlot,
  optimisticResizeDaysBySlotId,
}) => {
  const gantt = useGanttContext();
  const workingCalendarsByBayId = useMemo(() => createWorkingCalendarsByBayId(bays, offDays), [bays, offDays]);

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-20">
      {bays.flatMap((bay, bayIndex) =>
        bay.slots.map((slot) => (
          <BaySlotBar
            isScheduleMutationPending={isScheduleMutationPending}
            key={slot.id}
            onAddIdle={onAddIdleSlot}
            onRemove={onRemoveSlot}
            onResize={onResizeSlot}
            optimisticDurationDays={optimisticResizeDaysBySlotId[slot.id] ?? null}
            slot={slot}
            top={gantt.headerHeight + bayIndex * gantt.rowHeight + 6}
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
  isScheduleMutationPending: boolean;
  onAddIdle: (targetSlotId: string, placement: JobSlotPlacement) => void;
  onRemove: (slotId: string) => Promise<void>;
  onResize: (slotId: string, durationDays: number) => void;
  optimisticDurationDays: number | null;
  slot: ProjectedJobSlot;
  top: number;
  workingCalendar: WorkingCalendar;
}> = ({
  isScheduleMutationPending,
  onAddIdle,
  onRemove,
  onResize,
  optimisticDurationDays,
  slot,
  top,
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
  const left = getGanttOffset(startAt, gantt);
  const width = Math.max(getGanttWidth(startAt, previewEndAt, gantt), 28);
  const isIdle = slot.kind === 'idle';
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
      pixelsPerDay: Math.max(getGanttWidth(startAt, addJobSlotDuration(startAt, 1, workingCalendar), gantt), 1),
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
            className={cn(
              'pointer-events-auto absolute h-6 overflow-hidden rounded-sm px-2 py-1 text-xs shadow-sm',
              isIdle ? 'border border-border bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
            )}
            style={{
              left,
              top,
              width,
            }}
            title={`${label}: ${formatDate(slot.startAt, 'long')} - ${formatDate(slot.endAt, 'long')}`}
          />
        }
      >
        <span className="block truncate pr-8 font-medium">{label}</span>
        <Dialog onOpenChange={setIsRemoveDialogOpen} open={isRemoveDialogOpen}>
          <DialogTrigger
            render={
              <button
                aria-label={`Remove ${label}`}
                className={cn(
                  'absolute top-0 right-2 flex h-full w-6 items-center justify-center outline-none hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
                  isIdle
                    ? 'bg-muted/80 focus-visible:ring-foreground'
                    : 'bg-primary/80 focus-visible:ring-primary-foreground',
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
              : 'border-primary-foreground/70 bg-primary-foreground/15 hover:bg-primary-foreground/25 focus-visible:ring-2 focus-visible:ring-primary-foreground',
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

function getSlotLabel(slot: ProjectedJobSlot): string {
  return slot.kind === 'idle' ? (slot.label ?? DEFAULT_IDLE_SLOT_LABEL) : slot.jobCode;
}

function createWorkingCalendarsByBayId(bays: BaySchedule[], offDays: OffDay[]): Map<string, WorkingCalendar> {
  const orgOffDays = new Set(offDays.map((offDay) => offDay.date));

  return new Map(
    bays.map((bay) => [
      bay.id,
      {
        bayExceptions: new Map(
          bay.calendarExceptions.map((exception) => [exception.date, exception.direction] as const),
        ),
        orgOffDays,
      },
    ]),
  );
}
