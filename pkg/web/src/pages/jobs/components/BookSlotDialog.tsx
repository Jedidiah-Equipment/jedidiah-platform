import { bayWorkingCalendars, formatDate, hasPermission } from '@pkg/domain';
import { IconAlertTriangle, IconCalendarPlus, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { bayOperatorName } from '@/components/bays/bay-label.js';
import { DatePicker } from '@/components/common/DatePicker.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { allJobsInput } from './all-jobs-input.js';
import {
  createBayNonWorkingDateMatcher,
  describeInsertAtDatePlacement,
  getInsertAtDatePickerBounds,
  resolveBookSlotPlacement,
} from './book-slot-insert-at-date.js';

export const BookSlotDialog: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));

  const enabledBayIds = useMemo(
    () => new Set((enabledBaysQuery.data?.items ?? []).map((bay) => bay.id)),
    [enabledBaysQuery.data?.items],
  );
  const schedulableBays = useMemo(
    () =>
      (baysQuery.data?.items ?? []).filter(
        (bay) => enabledBayIds.has(bay.id) && hasPermission(accessQuery.data, 'job:schedule'),
      ),
    [accessQuery.data, baysQuery.data?.items, enabledBayIds],
  );
  const jobs = jobsQuery.data?.items ?? [];

  const [open, setOpen] = useState(false);
  const [selectedBayId, setSelectedBayId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [startDate, setStartDate] = useState('');

  const selectedBay = schedulableBays.find((bay) => bay.id === selectedBayId) ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  const workingCalendarsByBayId = useMemo(
    () => bayWorkingCalendars(baysQuery.data?.items ?? [], baysQuery.data?.offDays ?? []),
    [baysQuery.data],
  );
  const selectedBayCalendar = (selectedBay && workingCalendarsByBayId.get(selectedBay.id)) || {};
  const plantToday = baysQuery.data?.today ?? null;
  const pickerBounds =
    selectedBay && plantToday ? getInsertAtDatePickerBounds(selectedBay, selectedBayCalendar, plantToday) : null;
  const placementFeedback = useMemo(() => {
    if (!selectedBay || !startDate || !plantToday) {
      return null;
    }

    const placement = resolveBookSlotPlacement({
      bay: selectedBay,
      offDays: baysQuery.data?.offDays ?? [],
      startDate,
      today: plantToday,
    });

    return describeInsertAtDatePlacement(placement);
  }, [baysQuery.data?.offDays, plantToday, selectedBay, startDate]);

  const bookSlotMutation = useMutation(
    trpc.jobs.bookSlot.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        setOpen(false);
        toast.success('Job booked');
      },
      onError: (error) => showMutationError(error, 'Unable to book job.'),
    }),
  );

  const isPending = bookSlotMutation.isPending;
  const canBook = Boolean(selectedBay && selectedJob && durationDays > 0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) {
      return;
    }

    if (nextOpen) {
      setSelectedBayId('');
      setSelectedJobId('');
      setDurationDays(1);
      setStartDate('');
    }

    setOpen(nextOpen);
  };

  const handleBaySelect = (bayId: string) => {
    setSelectedBayId(bayId);

    const bay = schedulableBays.find((candidate) => candidate.id === bayId);
    setStartDate(
      bay && plantToday
        ? getInsertAtDatePickerBounds(bay, workingCalendarsByBayId.get(bay.id) ?? {}, plantToday).maxValue
        : '',
    );
  };

  if (schedulableBays.length === 0) {
    return null;
  }

  return (
    <>
      <Button onClick={() => handleOpenChange(true)}>
        <IconCalendarPlus data-icon="inline-start" />
        Schedule Bay Job
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Book Job into Bay Schedule</DialogTitle>
          </DialogHeader>
          <form
            id="book-slot-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (!selectedBay || !selectedJob || durationDays <= 0) {
                return;
              }

              bookSlotMutation.mutate({
                bayId: selectedBay.id,
                durationDays,
                jobId: selectedJob.id,
                ...(startDate ? { startDate } : {}),
              });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="book-slot-bay">Bay</FieldLabel>
                <Select
                  disabled={isPending}
                  onValueChange={(value) => handleBaySelect(String(value))}
                  value={selectedBay?.id ?? ''}
                >
                  <SelectTrigger id="book-slot-bay" className="w-full">
                    <SelectValue placeholder="Select bay">
                      {selectedBay ? (
                        <>
                          <span className="truncate">
                            {selectedBay.name}
                            {bayOperatorName(selectedBay) ? ` - ${bayOperatorName(selectedBay)}` : ''}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatDate(selectedBay.nextAvailableDate, 'MMM d')}
                          </span>
                        </>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {schedulableBays.map((bay) => (
                        <SelectItem key={bay.id} value={bay.id}>
                          {bay.name}
                          {bayOperatorName(bay) ? ` - ${bayOperatorName(bay)}` : ''}
                          <span className="text-muted-foreground">{formatDate(bay.nextAvailableDate, 'MMM d')}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {selectedBay && pickerBounds ? (
                <Field>
                  <FieldLabel htmlFor="book-slot-start-date">Start date</FieldLabel>
                  <DatePicker
                    disabled={isPending}
                    id="book-slot-start-date"
                    isDateDisabled={createBayNonWorkingDateMatcher(selectedBayCalendar)}
                    maxValue={pickerBounds.maxValue}
                    minValue={pickerBounds.minValue}
                    onChange={setStartDate}
                    value={startDate}
                  />
                  {placementFeedback ? <FieldDescription>{placementFeedback.startText}</FieldDescription> : null}
                  {placementFeedback?.splitWarning ? (
                    <Alert>
                      <IconAlertTriangle />
                      <AlertTitle>Splits an existing slot</AlertTitle>
                      <AlertDescription>{placementFeedback.splitWarning}</AlertDescription>
                    </Alert>
                  ) : null}
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="book-slot-job">Job</FieldLabel>
                <Select
                  disabled={isPending || jobsQuery.isLoading}
                  onValueChange={(value) => setSelectedJobId(String(value))}
                  value={selectedJob?.id ?? ''}
                >
                  <SelectTrigger id="book-slot-job" className="w-full">
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
              <Field>
                <FieldLabel htmlFor="book-slot-duration">Days</FieldLabel>
                <Input
                  disabled={isPending}
                  id="book-slot-duration"
                  min={1}
                  onChange={(event) => setDurationDays(Number.parseInt(event.currentTarget.value, 10) || 0)}
                  type="number"
                  value={durationDays}
                />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter>
            <Button disabled={isPending} onClick={() => handleOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isPending || !canBook} form="book-slot-form" type="submit">
              {isPending ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconCalendarPlus data-icon="inline-start" />
              )}
              Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
