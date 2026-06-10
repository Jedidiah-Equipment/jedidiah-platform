import { hasPermission } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';
import { IconBriefcase2, IconLoader2 } from '@tabler/icons-react';
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
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import {
  getBaySeedBayMap,
  JobCreateFormValues,
  toJobCreateFormValues,
  toJobCreateInput,
} from './generate-job-from-quote-form.js';

type GenerateJobFromQuoteDialogProps = {
  className?: string;
  quote: Pick<QuoteDetail, 'code' | 'id' | 'linkedJobs' | 'productBays' | 'status'>;
  size?: 'default' | 'icon-sm';
};

export const GenerateJobFromQuoteDialog: React.FC<GenerateJobFromQuoteDialogProps> = ({
  className,
  quote,
  size = 'default',
}) => {
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canGenerate = quote.status === 'accepted' && quote.linkedJobs.length === 0;

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
  const initialFormValues = useMemo(() => toJobCreateFormValues(quote), [quote]);
  const enabledBaysQuery = useQuery(
    trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }, { enabled: isOpen }),
  );
  const enabledBays = enabledBaysQuery.data?.items ?? [];
  const baysById = useMemo(
    () => getBaySeedBayMap({ enabledBays, productBays: quote.productBays }),
    [enabledBays, quote.productBays],
  );
  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([invalidateJobs(), invalidateQuotes()]);
        toast.success('Job started');
        setIsOpen(false);
        form.reset(initialFormValues);
        await navigate({ search: { job: job.id }, to: '/jobs' });
      },
      onError: (error) => showMutationError(error, 'Unable to start job.'),
    }),
  );
  const form = useAppForm({
    defaultValues: initialFormValues,
    validators: {
      onChange: JobCreateFormValues,
      onSubmit: JobCreateFormValues,
    },
    onSubmit: ({ value }) => {
      createJobMutation.mutate(toJobCreateInput({ quoteId: quote.id, value }));
    },
  });
  const isPending = createJobMutation.isPending || form.state.isSubmitting;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    form.reset(initialFormValues);
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
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Generate CFO & Start Job</DialogTitle>
          <DialogDescription>
            Generate CFO and start Job, quote will be locked once the Job is created.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
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
                    <CardDescription>Job duration estimates by Bay.</CardDescription>
                    <CardAction>
                      {enabledBaysQuery.isLoading ? <Skeleton className="h-8 w-72 max-w-full" /> : null}
                      {!enabledBaysQuery.isLoading && !enabledBaysQuery.error ? (
                        <AddBaySelect
                          bays={enabledBays}
                          disabled={isPending}
                          excludeBayIds={selectedBayIds}
                          onAdd={(bay) => baySeedsField.pushValue({ bayId: bay.id, durationDays: NaN })}
                        />
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  <CardSeparator />
                  <CardContent>
                    <section className="flex flex-col gap-4">
                      {enabledBaysQuery.error ? (
                        <ErrorMessage error={enabledBaysQuery.error} fallbackMessage="Unable to load Bays." />
                      ) : null}
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
          <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
            {({ canSubmit, isSubmitting }) => (
              <DialogFooter>
                <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>
                  Cancel
                </DialogClose>
                <Button disabled={isPending || isSubmitting || !canSubmit} type="submit">
                  {isPending || isSubmitting ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
                  Generate CFO & Start Job
                </Button>
              </DialogFooter>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
};
