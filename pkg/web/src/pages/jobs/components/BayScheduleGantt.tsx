import { formatDate, WORKING_DAY_MINUTES } from '@pkg/domain';
import type { BaySchedule, JobListInput, ProjectedJobSlot } from '@pkg/schema';
import { IconCalendarPlus, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { addMinutes } from 'date-fns';
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
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} satisfies JobListInput;

export const BayScheduleGantt: React.FC = () => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));
  const bays = baysQuery.data?.items ?? [];
  const initialDate = useMemo(() => new Date(), []);
  const [selectedBayId, setSelectedBayId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const selectedBay = bays.find((bay) => bay.id === selectedBayId) ?? bays[0] ?? null;
  const jobs = jobsQuery.data?.items ?? [];
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedStage = selectedBay
    ? (selectedJob?.stages.find((stage) => stage.stage === selectedBay.department) ?? null)
    : null;
  const canBook = Boolean(selectedBay && selectedStage && durationDays > 0);
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
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Slot resized');
      },
      onError: (error) => showMutationError(error, 'Unable to resize slot.'),
    }),
  );
  const handleResizeSlot = useCallback(
    (slotId: string, durationDays: number) => {
      resizeSlotMutation.mutate({
        durationMinutes: durationDays * WORKING_DAY_MINUTES,
        slotId,
      });
    },
    [resizeSlotMutation],
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
            durationMinutes: durationDays * WORKING_DAY_MINUTES,
            jobStageId: selectedStage.id,
          });
        }}
      >
        <Field className="min-w-56 max-w-72 flex-1 gap-1">
          <FieldLabel htmlFor="bay-schedule-bay">Bay</FieldLabel>
          <Select onValueChange={(value) => setSelectedBayId(String(value))} value={selectedBay?.id ?? ''}>
            <SelectTrigger id="bay-schedule-bay" className="w-full">
              <SelectValue placeholder="Select bay" />
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
              <SelectValue placeholder={jobsQuery.isLoading ? 'Loading jobs' : 'Select job'} />
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
        <Button disabled={!canBook || bookSlotMutation.isPending} type="submit">
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
          height: Math.max(220, 60 + bays.length * 36),
        }}
      >
        <GanttProvider
          className="h-full border border-border/70 bg-background"
          initialDate={initialDate}
          initialDateAlignment="start"
          range="daily"
          zoom={200}
        >
          <BayScheduleSidebar bays={bays} />
          <GanttTimeline>
            <GanttHeader />
            <BayLaneDividers bays={bays} />
            <BaySlotBars bays={bays} isResizePending={resizeSlotMutation.isPending} onResizeSlot={handleResizeSlot} />
            <GanttToday className="bg-primary text-primary-foreground" />
          </GanttTimeline>
        </GanttProvider>
      </div>
    </div>
  );
};

const BayScheduleSidebar: React.FC<{
  bays: BaySchedule[];
}> = ({ bays }) => (
  <GanttSidebar secondaryTitle={null} title="Bay">
    <div className="divide-y divide-border/50">
      {bays.map((bay) => (
        <div className="flex items-center px-2.5 text-xs" key={bay.id} style={{ height: 'var(--gantt-row-height)' }}>
          <p className="truncate font-medium">{bay.name}</p>
        </div>
      ))}
    </div>
  </GanttSidebar>
);

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
  isResizePending: boolean;
  onResizeSlot: (slotId: string, durationDays: number) => void;
}> = ({ bays, isResizePending, onResizeSlot }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-20">
      {bays.flatMap((bay, bayIndex) =>
        bay.slots.map((slot) => (
          <BaySlotBar
            isResizePending={isResizePending}
            key={slot.id}
            onResize={onResizeSlot}
            slot={slot}
            top={gantt.headerHeight + bayIndex * gantt.rowHeight + 6}
          />
        )),
      )}
    </div>
  );
};

type SlotResizeDrag = {
  durationDays: number;
  initialDurationDays: number;
  pixelsPerWorkingDay: number;
  startX: number;
};

const BaySlotBar: React.FC<{
  isResizePending: boolean;
  onResize: (slotId: string, durationDays: number) => void;
  slot: ProjectedJobSlot;
  top: number;
}> = ({ isResizePending, onResize, slot, top }) => {
  const gantt = useGanttContext();
  const [resizeDrag, setResizeDrag] = useState<SlotResizeDrag | null>(null);
  const startAt = useMemo(() => new Date(slot.startAt), [slot.startAt]);
  const endAt = useMemo(() => new Date(slot.endAt), [slot.endAt]);
  const durationDays = Math.max(1, Math.round(slot.durationMinutes / WORKING_DAY_MINUTES));
  const previewDurationDays = resizeDrag?.durationDays ?? durationDays;
  const previewEndAt = useMemo(
    () => (resizeDrag ? addMinutes(startAt, previewDurationDays * WORKING_DAY_MINUTES) : endAt),
    [endAt, previewDurationDays, resizeDrag, startAt],
  );
  const left = getGanttOffset(startAt, gantt);
  const width = Math.max(getGanttWidth(startAt, previewEndAt, gantt), 28);
  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isResizePending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeDrag({
      durationDays,
      initialDurationDays: durationDays,
      pixelsPerWorkingDay: Math.max(getGanttWidth(startAt, addMinutes(startAt, WORKING_DAY_MINUTES), gantt), 1),
      startX: event.clientX,
    });
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeDrag) {
      return;
    }

    event.preventDefault();
    const deltaDays = Math.round((event.clientX - resizeDrag.startX) / resizeDrag.pixelsPerWorkingDay);
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

  return (
    <div
      className="pointer-events-auto absolute h-6 overflow-hidden rounded-sm bg-primary px-2 py-1 text-primary-foreground text-xs shadow-sm"
      style={{
        left,
        top,
        width,
      }}
      title={`${slot.jobCode}: ${formatDate(slot.startAt, 'long')} - ${formatDate(slot.endAt, 'long')}`}
    >
      <span className="block truncate pr-2 font-medium">{slot.jobCode}</span>
      <button
        aria-label={`Resize ${slot.jobCode}`}
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize border-primary-foreground/70 border-r-2 bg-primary-foreground/15 outline-none hover:bg-primary-foreground/25 focus-visible:ring-2 focus-visible:ring-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isResizePending}
        onPointerCancel={finishResize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishResize}
        type="button"
      />
    </div>
  );
};
