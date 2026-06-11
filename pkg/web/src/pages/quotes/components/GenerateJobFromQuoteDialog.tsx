import { hasPermission } from '@pkg/domain';
import type { Bay, JobCreateInput, QuoteDetail, UUID } from '@pkg/schema';
import { IconAlertTriangle, IconBriefcase2, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AddBaySelect, BayRowCard } from '@/components/bays/index.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from '@/components/ui/card.js';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { BayScheduleGantt } from '@/pages/jobs/components/BayScheduleGantt.js';
import { createBayNonWorkingDateMatcher } from '@/pages/jobs/components/book-slot-insert-at-date.js';

import {
  type BaySeedScheduling,
  createBaySeedScheduling,
  getBaySeedBayMap,
  getBaySeedDefaultStartDate,
  getBaySeedRowScheduling,
  JobCreateFormValues,
  toJobCreateFormValues,
  toJobCreateInput,
} from './generate-job-from-quote-form.js';

type GenerateJobFromQuoteDialogProps = {
  className?: string;
  quote: Pick<QuoteDetail, 'code' | 'id' | 'job' | 'productBays' | 'status'>;
  size?: 'default' | 'icon-sm';
};

export const GenerateJobFromQuoteDialog: React.FC<GenerateJobFromQuoteDialogProps> = ({
  className,
  quote,
  size = 'default',
}) => {
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canGenerate = quote.status === 'accepted' && quote.job === null;

  if (!canCreateJob || !canGenerate) {
    return null;
  }

  return (
    <GenerateJobFromQuoteDialogContent {...(className === undefined ? {} : { className })} quote={quote} size={size} />
  );
};

const GenerateJobFromQuoteDialogContent: React.FC<GenerateJobFromQuoteDialogProps> = ({
  className,
  quote,
  size = 'default',
}) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobs, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const enabledBaysQuery = useQuery(
    trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }, { enabled: isOpen }),
  );
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled: isOpen }));
  const enabledBays = enabledBaysQuery.data?.items ?? [];
  const baysById = useMemo(
    () => getBaySeedBayMap({ enabledBays, productBays: quote.productBays }),
    [enabledBays, quote.productBays],
  );
  // Schedule data is enrichment: when it fails the form still works, seeds just append.
  const scheduling = useMemo(() => (baysQuery.data ? createBaySeedScheduling(baysQuery.data) : null), [baysQuery.data]);
  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([invalidateJobs(), invalidateQuotes()]);
        toast.success('Job started');
        setIsOpen(false);
        await navigate({ search: { job: job.id }, to: '/jobs' });
      },
      onError: (error) => showMutationError(error, 'Unable to start job.'),
    }),
  );
  const isPending = createJobMutation.isPending;

  const handleOpenChange = (open: boolean) => {
    if (isPending) {
      return;
    }

    setIsOpen(open);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label={`Generate CFO and start job from quote ${quote.code}`}
            className={className}
            size={size}
            type="button"
            variant={size === 'icon-sm' ? 'outline' : 'default'}
          />
        }
      >
        <IconBriefcase2 data-icon={size === 'icon-sm' ? undefined : 'inline-start'} />
        {size === 'icon-sm' ? null : 'Generate CFO & Start Job'}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] gap-3 overflow-hidden sm:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>Generate CFO & Start Job</DialogTitle>
          <DialogDescription>
            Generate CFO and start Job, quote will be locked once the Job is created. Schedule edits save immediately;
            this Job's slots are created on submit. Cancel discards only the uncreated Job.
          </DialogDescription>
        </DialogHeader>
        {enabledBaysQuery.isLoading || baysQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <GenerateJobForm
            baysById={baysById}
            baysError={enabledBaysQuery.error ?? baysQuery.error}
            enabledBays={enabledBays}
            isPending={isPending}
            onSubmit={(input) => createJobMutation.mutate(input)}
            quote={quote}
            scheduling={scheduling}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

type GenerateJobFormProps = {
  baysById: Map<UUID, Bay>;
  baysError: unknown;
  enabledBays: Bay[];
  isPending: boolean;
  onSubmit: (input: JobCreateInput) => void;
  quote: Pick<QuoteDetail, 'code' | 'id' | 'productBays'>;
  scheduling: BaySeedScheduling | null;
};

const GenerateJobForm: React.FC<GenerateJobFormProps> = ({
  baysById,
  baysError,
  enabledBays,
  isPending,
  onSubmit,
  quote,
  scheduling,
}) => {
  const initialFormValues = useMemo(
    () => toJobCreateFormValues({ productBays: quote.productBays, scheduling }),
    [quote.productBays, scheduling],
  );
  const form = useAppForm({
    defaultValues: initialFormValues,
    validators: {
      onChange: JobCreateFormValues,
      onSubmit: JobCreateFormValues,
    },
    onSubmit: ({ value }) => {
      onSubmit(toJobCreateInput({ quoteId: quote.id, value }));
    },
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <ScrollArea className="max-h-[calc(100vh-16rem)] min-h-0">
        <div className="flex flex-col gap-4">
          <form.Field name="baySeeds" mode="array">
            {(baySeedsField) => {
              const selectedBayIds = new Set(baySeedsField.state.value.map((row) => row.bayId));

              return (
                <Card>
                  <CardHeader>
                    <CardTitle>Assigned Bays</CardTitle>
                    <CardDescription>Job duration estimates by Bay.</CardDescription>
                    <CardAction>
                      <AddBaySelect
                        bays={enabledBays}
                        disabled={isPending}
                        excludeBayIds={selectedBayIds}
                        onAdd={(bay) =>
                          baySeedsField.pushValue({
                            bayId: bay.id,
                            durationDays: NaN,
                            startDate: getBaySeedDefaultStartDate(scheduling, bay.id),
                          })
                        }
                      />
                    </CardAction>
                  </CardHeader>
                  <CardSeparator />
                  <CardContent>
                    <section className="flex flex-col gap-4">
                      {baysError ? <ErrorMessage error={baysError} fallbackMessage="Unable to load Bays." /> : null}
                      {baySeedsField.state.value.length === 0 ? (
                        <Empty>
                          <EmptyHeader>
                            <EmptyIcon />
                            <EmptyTitle>No Bays selected.</EmptyTitle>
                            <EmptyDescription>Select a Bay from the header to add it to the Job.</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {baySeedsField.state.value.map((row, index) => (
                            <BayRowCard
                              bay={baysById.get(row.bayId)}
                              key={row.bayId}
                              onRemove={() => baySeedsField.removeValue(index)}
                              removeDisabled={isPending}
                              removeLabel={`Remove Bay seed ${index + 1}`}
                              unavailableHint="Bay must be reselected"
                            >
                              <div className="flex items-center gap-3 self-center">
                                <form.AppField name={`baySeeds[${index}].startDate`}>
                                  {(startDateField) => {
                                    const rowScheduling = getBaySeedRowScheduling(scheduling, {
                                      bayId: row.bayId,
                                      startDate: startDateField.state.value,
                                    });

                                    if (!rowScheduling) {
                                      return null;
                                    }

                                    return (
                                      <>
                                        <startDateField.DatePickerField
                                          disabled={isPending}
                                          fieldClassName="w-56 *:data-[slot=field-label]:flex-none"
                                          isDateDisabled={createBayNonWorkingDateMatcher(rowScheduling.workingCalendar)}
                                          label="Start"
                                          maxValue={rowScheduling.bounds.maxValue}
                                          minValue={rowScheduling.bounds.minValue}
                                          orientation="horizontal"
                                        />
                                        {rowScheduling.splitWarning ? (
                                          <Tooltip>
                                            <TooltipTrigger
                                              render={
                                                <span
                                                  aria-label={`Bay seed ${index + 1} splits an existing slot`}
                                                  className="text-amber-700 dark:text-amber-300"
                                                  role="img"
                                                />
                                              }
                                            >
                                              <IconAlertTriangle className="size-4" />
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-64">
                                              {rowScheduling.splitWarning}
                                            </TooltipContent>
                                          </Tooltip>
                                        ) : null}
                                      </>
                                    );
                                  }}
                                </form.AppField>
                                <form.AppField name={`baySeeds[${index}].durationDays`}>
                                  {(field) => (
                                    <field.NumberField
                                      className="w-20"
                                      disabled={isPending}
                                      emptyValue={Number.NaN}
                                      inputMode="numeric"
                                      label="Days"
                                      orientation="horizontal"
                                      placeholder="1"
                                      fieldClassName="self-center *:data-[slot=field-label]:flex-none"
                                    />
                                  )}
                                </form.AppField>
                              </div>
                            </BayRowCard>
                          ))}
                        </div>
                      )}
                    </section>
                  </CardContent>
                </Card>
              );
            }}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.baySeeds}>
            {(baySeeds) =>
              baySeeds.length > 0 ? (
                <BayScheduleGantt
                  embedded
                  ghostLabel={quote.code}
                  ghostSeeds={baySeeds}
                  visibleBayIds={baySeeds.map((row) => row.bayId)}
                />
              ) : null
            }
          </form.Subscribe>
        </div>
      </ScrollArea>
      <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
        {({ canSubmit, isSubmitting: isFormSubmitting }) => (
          <DialogFooter>
            <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
            <Button disabled={isPending || isFormSubmitting || !canSubmit} type="submit">
              {isPending || isFormSubmitting ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
              Generate CFO & Start Job
            </Button>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
};
