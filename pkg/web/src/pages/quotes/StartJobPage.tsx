import { hasPermission } from '@pkg/domain';
import type { Bay, JobCreateInput, QuoteDetail, UUID } from '@pkg/schema';
import { DateOnlyIsoString } from '@pkg/schema';
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { AddBaySelect, BayRowCard } from '@/components/bays/index.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { type DatePickerFieldProps, useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { BayScheduleGantt } from '@/pages/jobs/components/BayScheduleGantt.js';
import { createSchedulePreviewRequest } from '@/pages/jobs/components/bay-schedule-ghosts.js';
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
} from './components/generate-job-from-quote-form.js';

type StartJobPageProps = {
  quoteId: UUID;
};

export const StartJobPage: React.FC<StartJobPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const quote = quoteQuery.data;

  return (
    <PageLayout
      description="Generate CFO and start Job; the quote is locked once the Job is created. Schedule edits save immediately; this Job's slots are created on submit. Cancel discards only the uncreated Job."
      size="full"
      title={quote ? `Start Job from ${quote.code}` : 'Loading quote...'}
    >
      <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
      {quoteQuery.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {quote ? <StartJobContent quote={quote} /> : null}
    </PageLayout>
  );
};

const StartJobContent: React.FC<{ quote: QuoteDetail }> = ({ quote }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobs, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
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
        // Jobs first so the schedule is fresh on arrival; the quote refetch happens
        // after navigation so this page never flashes its not-startable state.
        await invalidateJobs();
        toast.success('Job started');
        await navigate({ search: { job: job.id }, to: '/jobs' });
        await invalidateQuotes();
      },
      onError: (error) => showMutationError(error, 'Unable to start job.'),
    }),
  );

  if (!canCreateJob || quote.status !== 'accepted' || (quote.job !== null && !createJobMutation.isSuccess)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyIcon />
          <EmptyTitle>This quote cannot start a Job.</EmptyTitle>
          <EmptyDescription>
            {quote.job !== null
              ? 'A Job has already been created from this quote.'
              : quote.status !== 'accepted'
                ? 'Only accepted quotes can start a Job.'
                : 'You do not have permission to create Jobs.'}
          </EmptyDescription>
        </EmptyHeader>
        <Button render={<Link params={{ id: quote.id }} to="/quotes/$id/edit" />} variant="outline">
          Back to quote
        </Button>
      </Empty>
    );
  }

  if (enabledBaysQuery.isLoading || baysQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <StartJobForm
      baysById={baysById}
      baysError={enabledBaysQuery.error ?? baysQuery.error}
      enabledBays={enabledBays}
      isPending={createJobMutation.isPending}
      onSubmit={(input) => createJobMutation.mutate(input)}
      quote={quote}
      scheduling={scheduling}
    />
  );
};

type StartJobFormProps = {
  baysById: Map<UUID, Bay>;
  baysError: unknown;
  enabledBays: Bay[];
  isPending: boolean;
  onSubmit: (input: JobCreateInput) => void;
  quote: Pick<QuoteDetail, 'code' | 'id' | 'productBays'>;
  scheduling: BaySeedScheduling | null;
};

type StartDateFieldApi = {
  state: { value: string };
  DatePickerField: React.ComponentType<DatePickerFieldProps>;
};

const BaySeedStartDateControl: React.FC<{
  bayId: UUID;
  index: number;
  isPending: boolean;
  scheduling: BaySeedScheduling | null;
  startDateField: StartDateFieldApi;
}> = ({ bayId, index, isPending, scheduling, startDateField }) => {
  const trpc = useTRPC();
  const startDate = startDateField.state.value;
  const hasScheduleData = Boolean(scheduling?.schedulesByBayId.has(bayId));
  const shouldPreviewPlacement = hasScheduleData && DateOnlyIsoString.safeParse(startDate).success;
  const previewRequest = useMemo(
    () =>
      shouldPreviewPlacement
        ? // Placement (append/insert/split position and its split warning) resolves from the picked
          // date against the target Slot, never the inserted seed's own length, so any valid duration
          // works — `1` just clears the preview's "positive integer duration" gate.
          createSchedulePreviewRequest([{ bayId, durationDays: 1, startDate }])
        : { input: { seeds: [] } },
    [bayId, shouldPreviewPlacement, startDate],
  );
  const previewQuery = useQuery(
    trpc.jobs.previewSchedule.queryOptions(previewRequest.input, {
      enabled: previewRequest.input.seeds.length === 1,
    }),
  );
  const rowScheduling = getBaySeedRowScheduling(
    scheduling,
    { bayId, startDate },
    previewQuery.data?.placements[0] ?? null,
  );

  if (!rowScheduling) {
    return null;
  }

  return (
    <>
      <startDateField.DatePickerField
        disabled={isPending}
        fieldClassName="w-64 shrink-0 *:data-[slot=field-label]:flex-none"
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
          <TooltipContent className="max-w-64">{rowScheduling.splitWarning}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
};

const StartJobForm: React.FC<StartJobFormProps> = ({
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
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="baySeeds" mode="array">
        {(baySeedsField) => {
          const selectedBayIds = new Set(baySeedsField.state.value.map((row) => row.bayId));

          return (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Bays</CardTitle>
                <CardDescription>
                  Each row books a Work Slot into that Bay's queue when the Job is created.
                </CardDescription>
                <CardAction>
                  <AddBaySelect
                    bays={enabledBays}
                    disabled={isPending}
                    excludeBayIds={selectedBayIds}
                    onAdd={(bay) =>
                      baySeedsField.pushValue({
                        bayId: bay.id,
                        // Manually added Bays have no Product Bay estimate; start from a sane booking.
                        durationDays: 5,
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
                    // Responsive grid: equal-width seed cards align in columns, as many per row as fit.
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,38rem),1fr))] gap-3">
                      {baySeedsField.state.value.map((row, index) => (
                        <BayRowCard
                          bay={baysById.get(row.bayId)}
                          key={row.bayId}
                          onRemove={() => baySeedsField.removeValue(index)}
                          removeDisabled={isPending}
                          removeLabel={`Remove Bay seed ${index + 1}`}
                          showOperator
                          unavailableHint="Bay must be reselected"
                        >
                          <div className="flex items-center gap-3 self-center">
                            <form.AppField name={`baySeeds[${index}].startDate`}>
                              {(startDateField) => (
                                <BaySeedStartDateControl
                                  bayId={row.bayId}
                                  index={index}
                                  isPending={isPending}
                                  scheduling={scheduling}
                                  startDateField={startDateField}
                                />
                              )}
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
      <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
        {({ canSubmit, isSubmitting: isFormSubmitting }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={isPending}
              render={<Link params={{ id: quote.id }} to="/quotes/$id/edit" />}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending || isFormSubmitting || !canSubmit} type="submit">
              {isPending || isFormSubmitting ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
              Generate CFO & Start Job
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
};
