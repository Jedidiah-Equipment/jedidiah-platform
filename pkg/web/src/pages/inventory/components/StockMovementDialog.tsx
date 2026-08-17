import { useDebouncedValue } from '@mantine/hooks';
import { deriveMovementWarnings, type JobMovementFacts } from '@pkg/domain';
import type {
  InventoryJobOption,
  JobStockMovementType,
  JobStockRow,
  StockMovementWarningCode,
  StockOnHandRow,
} from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { useInventoryJobOptions } from '@/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useMovementWarnings } from '@/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';
import {
  partQuantityValidationMessage,
  partSelectOptions,
  type StockJobMovementFormValues,
  type StockPartOption,
  stockJobMovementValidator,
  toJobMovementInput,
} from './types.js';

type FixedJob = { code: string; id: string };

export function StockMovementDialog({
  defaultPartId = '',
  fixedJob,
  isLoadingParts = false,
  items,
  onOpenChange,
  open,
  parts,
  type,
}: {
  /** Pre-selects the Part, so a leftover row can open straight onto the Part it is returning. */
  defaultPartId?: string;
  fixedJob?: FixedJob;
  /** Set where the Part list is fetched only once the dialog opens, so the select can say so. */
  isLoadingParts?: boolean;
  items: readonly StockOnHandRow[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
  type: JobStockMovementType;
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [jobSearch, setJobSearch] = useState('');
  const [debouncedJobSearch] = useDebouncedValue(jobSearch, 250);
  const [selectedJob, setSelectedJob] = useState<InventoryJobOption | null>(null);
  const movementWarningsOutcome = useMovementWarnings();
  const validator = useMemo(() => stockJobMovementValidator(parts), [parts]);
  const verb = type === 'checkout' ? 'Check out' : 'Return';
  const jobId = fixedJob?.id ?? selectedJob?.id ?? '';

  const jobOptions = useInventoryJobOptions({
    enabled: fixedJob === undefined,
    movementType: type,
    search: debouncedJobSearch,
    selected: selectedJob,
  });
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }, { enabled: jobId !== '' }));
  const mutation = useMutation(
    (type === 'checkout' ? trpc.inventory.postCheckout : trpc.inventory.postReturnToStore).mutationOptions({
      onError: (error) =>
        showMutationError(error, type === 'checkout' ? 'Unable to check stock out.' : 'Unable to return stock.'),
    }),
  );

  function movementFacts(values: StockJobMovementFormValues): JobMovementFacts {
    const lengthMm = Number.isNaN(values.lengthMm) ? null : values.lengthMm;
    const jobStock: JobStockRow | undefined = jobStockQuery.data?.items.find((row) => row.partId === values.partId);
    const bucket = items
      .find((row) => row.partId === values.partId)
      ?.buckets.find((candidate) => candidate.lengthMm === lengthMm);

    return {
      bucketQuantityOnHand: bucket?.quantity ?? 0,
      cfoQuantity: jobStock?.cfoQuantity ?? 0,
      drawnBucketQuantity:
        lengthMm === null
          ? (jobStock?.drawnQuantity ?? 0)
          : (jobStock?.lengthBuckets.find((candidate) => candidate.lengthMm === lengthMm)?.drawnQuantity ?? 0),
      drawnQuantity: jobStock?.drawnQuantity ?? 0,
    };
  }

  /**
   * The same judgement the ledger applies on post (`@pkg/domain`), run against what this dialog has
   * loaded so the reader sees it before committing rather than only afterwards.
   */
  function movementWarnings(values: StockJobMovementFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity) || values.jobId === '' || values.partId === '') return [];
    // Until the Job's stock arrives, every figure reads zero, which would warn on any draw at all.
    // Staying quiet is the honest state: the post still returns the ledger's own verdict.
    if (jobStockQuery.isPending) return [];

    return deriveMovementWarnings({ facts: { ...movementFacts(values), kind: type }, quantity: values.quantity });
  }

  return (
    <CreateEntityDialog<StockJobMovementFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{ jobId: fixedJob?.id ?? '', lengthMm: Number.NaN, partId: defaultPartId, quantity: Number.NaN }}
      description={
        type === 'checkout' ? 'Draw a Part from stock against any Job.' : 'Return a previously drawn Part to store.'
      }
      onCreate={(values) => {
        const part = parts.find((candidate) => candidate.partId === values.partId);
        if (!part) throw new Error('Select a Part');

        movementWarningsOutcome.acknowledge(movementWarnings(values));
        return mutation.mutateAsync(toJobMovementInput(values, part));
      }}
      onCreated={async (result) => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success(type === 'checkout' ? 'Stock checked out' : 'Stock returned to store');
        movementWarningsOutcome.reconcile(result.warnings);
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={(values) => (movementWarnings(values).length > 0 ? `${verb} anyway` : `${verb} stock`)}
      title={`${verb} stock`}
      validator={validator}
    >
      {(form) => (
        <>
          {fixedJob ? (
            <Field>
              <FieldLabel>Job</FieldLabel>
              <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedJob.code}</div>
            </Field>
          ) : (
            <form.AppField name="jobId">
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor="inventory-job-movement-job">Job</FieldLabel>
                  <EntityCombobox
                    disabled={false}
                    emptyMessage="No Jobs found"
                    inputId="inventory-job-movement-job"
                    inputValue={jobSearch}
                    isFetching={jobOptions.isFetching}
                    itemToLabel={jobOptionLabel}
                    loadMore={{
                      ...jobOptions.pagination,
                      totalLabel: (total) => `${total} ${total === 1 ? 'Job' : 'Jobs'}`,
                    }}
                    onInputValueChange={setJobSearch}
                    onSelected={(job) => {
                      setSelectedJob(job);
                      setJobSearch('');
                      field.handleChange(job?.id ?? '');
                    }}
                    options={jobOptions.options}
                    placeholder="Search jobs"
                    renderItem={(job) => jobOptionLabel(job)}
                    searchPlaceholder="Searching jobs..."
                    value={selectedJob}
                  />
                </Field>
              )}
            </form.AppField>
          )}
          <form.AppField name="partId">
            {(field) => (
              <field.ComboboxField
                disabled={isLoadingParts}
                emptyMessage="No Parts found."
                label="Part"
                onValueCommit={() => {
                  // The selection commits first; defer until the form exposes the new Part to the dependent validator.
                  queueMicrotask(() => void form.validateField('quantity', 'blur'));
                }}
                options={partSelectOptions(parts)}
                placeholder={isLoadingParts ? 'Loading parts...' : 'Search parts'}
              />
            )}
          </form.AppField>
          <form.AppField
            name="quantity"
            validators={{
              onBlur: ({ value }) =>
                partQuantityValidationMessage({ partId: form.state.values.partId, quantity: value }, parts),
            }}
          >
            {(field) => <field.NumberField label="Quantity" min={0.001} step="0.001" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const part = parts.find((candidate) => candidate.partId === values.partId);

              return (
                <>
                  {part?.unitOfMeasure === 'mm' ? (
                    <form.AppField name="lengthMm">
                      {(field) => (
                        <field.NumberField
                          description={
                            part.standardPurchaseLengthMm === null
                              ? undefined
                              : `Standard purchase length is ${part.standardPurchaseLengthMm} mm.`
                          }
                          inputMode="numeric"
                          label="Length (mm)"
                          min={1}
                          step="1"
                        />
                      )}
                    </form.AppField>
                  ) : null}
                  <StockMovementWarningPrompt warnings={movementWarnings(values)} />
                </>
              );
            }}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}

function jobOptionLabel(job: InventoryJobOption): string {
  return `${job.code} · ${job.displayName}`;
}
