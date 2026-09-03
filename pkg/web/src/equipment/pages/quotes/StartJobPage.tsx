import { hasPermission, isReworkQuote } from '@pkg/domain';
import type { Bay, JobCreateInput, QuoteDetail, UUID } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useBayCalendars } from '@/equipment/hooks/use-bay-calendars.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { BoardGantt } from '@/equipment/pages/jobs/components/BoardGantt.js';
import { JobBaySeedsCard } from '@/equipment/pages/jobs/components/JobBaySeedsCard.js';
import {
  type BaySeedScheduling,
  createBaySeedScheduling,
  getBaySeedBayMap,
  JobCreateFormValues,
  toJobCreateFormValues,
  toJobCreateInput,
} from '@/equipment/pages/jobs/components/job-bay-seeds.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

import { canStartJobFromQuote, getStartJobUnavailableMessage } from './components/start-job-eligibility.js';

type StartJobPageProps = {
  quoteId: UUID;
};

export const StartJobPage: React.FC<StartJobPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const quote = quoteQuery.data;
  const isRework = quote !== undefined && isReworkQuote(quote);

  return (
    <PageLayout
      description={
        isRework
          ? "Start a Rework Job on this Quote's existing Product Unit and optionally seed its Bay schedule. Its Build Spec and CFO cover only the Assemblies being added."
          : "Start a Job from this Quote and optionally seed its Bay schedule. Schedule edits save immediately; this Job's slots are created on submit. Cancel discards only the uncreated Job."
      }
      size="full"
      title={quote ? `Start ${isRework ? 'Rework Job' : 'Job'} from ${quote.code}` : 'Loading quote...'}
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
  const { invalidateJobActivity, invalidateJobs, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const isRework = isReworkQuote(quote);
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const bayCalendars = useBayCalendars();
  const enabledBays = enabledBaysQuery.data?.items ?? [];
  const productBays = quote.product?.bays ?? [];
  const baysById = useMemo(() => getBaySeedBayMap({ enabledBays, productBays }), [enabledBays, productBays]);
  // Schedule data is enrichment: when it fails the form still works, seeds just append.
  const scheduling = useMemo(
    () =>
      baysQuery.data && bayCalendars
        ? createBaySeedScheduling(baysQuery.data, bayCalendars.workingCalendarsByBayId)
        : null,
    [bayCalendars, baysQuery.data],
  );
  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        // Jobs first so the schedule is fresh on arrival; the quote refetch happens
        // after navigation so this page never flashes its not-startable state.
        await Promise.all([invalidateJobs(), invalidateJobActivity()]);
        toast.success(isRework ? 'Rework Job started' : 'Job started');
        await navigate({ search: { job: job.id }, to: '/equipment/jobs' });
        await invalidateQuotes();
      },
      onError: (error) => showMutationError(error, 'Unable to start job.'),
    }),
  );

  if ((!canCreateJob || !canStartJobFromQuote(quote)) && !createJobMutation.isSuccess) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyIcon />
          <EmptyTitle>This quote cannot start a {isRework ? 'Rework Job' : 'Job'}.</EmptyTitle>
          <EmptyDescription>{getStartJobUnavailableMessage(quote, canCreateJob)}</EmptyDescription>
        </EmptyHeader>
        <Button render={<Link params={{ id: quote.id }} to="/equipment/quotes/$id/edit" />} variant="outline">
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
  quote: Pick<QuoteDetail, 'code' | 'id' | 'product' | 'productUnitId'>;
  scheduling: BaySeedScheduling | null;
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
  const [showAllBays, setShowAllBays] = useState(true);
  const isRework = isReworkQuote(quote);
  const initialFormValues = useMemo(
    () => toJobCreateFormValues({ productBays: quote.product?.bays ?? [], scheduling }),
    [quote.product, scheduling],
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
      <JobBaySeedsCard
        baysById={baysById}
        baysError={baysError}
        enabledBays={enabledBays}
        fields={{ baySeeds: 'baySeeds' }}
        form={form}
        isPending={isPending}
        onShowAllBaysChange={setShowAllBays}
        scheduling={scheduling}
        showAllBays={showAllBays}
        showAllBaysInputId="start-job-show-all-bays"
      />
      <form.Subscribe selector={(state) => state.values.baySeeds}>
        {(baySeeds) =>
          showAllBays || baySeeds.length > 0 ? (
            <BoardGantt
              embedded
              ghostLabel={quote.code}
              ghostSeeds={baySeeds}
              visibleBayIds={showAllBays ? undefined : baySeeds.map((row) => row.bayId)}
            />
          ) : null
        }
      </form.Subscribe>
      <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
        {({ canSubmit, isSubmitting: isFormSubmitting }) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={isPending}
              render={<Link params={{ id: quote.id }} to="/equipment/quotes/$id/edit" />}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending || isFormSubmitting || !canSubmit} type="submit">
              {isPending || isFormSubmitting ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
              {isRework ? 'Start Rework Job' : 'Start Job'}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
};
