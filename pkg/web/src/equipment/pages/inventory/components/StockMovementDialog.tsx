import { deriveMovementWarnings, type JobMovementFacts } from '@pkg/domain/equipment';
import type {
  InventoryQuoteOption,
  JobPickerOption,
  JobStockLengthBucket,
  JobStockRow,
  StockMovementWarningCode,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { JobPicker, JobPickerTrigger } from '@/equipment/components/job-picker/index.js';
import { useInventoryJobPicker } from '@/equipment/hooks/options/index.js';
import { useMovementWarnings } from '@/equipment/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

import { InventoryQuotePicker } from './InventoryQuotePicker.js';
import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';
import {
  partIdFromScanToken,
  partQuantityValidationMessage,
  partSelectOptions,
  type ReturnStockFormValues,
  type ReturnStockTarget,
  returnStockValidator,
  type StockPartOption,
  toReturnStockInput,
} from './types.js';
import { useInventoryQuotePicker } from './use-inventory-quote-picker.js';

type FixedTarget = { code: string; id: string };

/**
 * Returns one Part from a Job or a Parts Sale, pooled like the draws it reverses. Checkout owns a
 * separate multi-line dialog; a source-linked return is a different form altogether — see
 * `ReturnFromCheckoutDialog`.
 */
export function StockMovementDialog({
  defaultPartId = '',
  fixedJob,
  fixedQuote,
  isLoadingParts = false,
  items,
  onOpenChange,
  open,
  parts,
}: {
  /** Pre-selects the Part, so a leftover row can open straight onto the Part it is returning. */
  defaultPartId?: string;
  fixedJob?: FixedTarget;
  fixedQuote?: FixedTarget;
  /** Set where the Part list is fetched only once the dialog opens, so the select can say so. */
  isLoadingParts?: boolean;
  items: readonly StockOnHandRow[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isJobPickerOpen, setJobPickerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPickerOption | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<InventoryQuoteOption | null>(null);
  const movementWarningsOutcome = useMovementWarnings();
  const validator = useMemo(() => returnStockValidator(parts), [parts]);
  const isFixed = fixedJob !== undefined || fixedQuote !== undefined;
  const jobId = fixedJob?.id ?? selectedJob?.id ?? '';
  const quoteId = fixedQuote?.id ?? selectedQuote?.id ?? '';

  const jobPicker = useInventoryJobPicker({ enabled: !isFixed, movementType: 'return-to-store' });
  const quotePicker = useInventoryQuotePicker({ enabled: open && !isFixed, movementType: 'return-to-store' });
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }, { enabled: jobId !== '' }));
  const quoteStockQuery = useQuery(trpc.inventory.quoteStock.queryOptions({ quoteId }, { enabled: quoteId !== '' }));
  const returnMutation = useMutation(
    trpc.inventory.postReturnToStore.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to return stock.'),
    }),
  );

  function bucketQuantityOnHand(values: ReturnStockFormValues): number {
    const lengthMm = Number.isNaN(values.lengthMm) ? null : values.lengthMm;

    return (
      items.find((row) => row.partId === values.partId)?.buckets.find((candidate) => candidate.lengthMm === lengthMm)
        ?.quantity ?? 0
    );
  }

  function movementFacts(values: ReturnStockFormValues): JobMovementFacts {
    const jobStock: JobStockRow | undefined = jobStockQuery.data?.items.find((row) => row.partId === values.partId);

    return {
      bucketQuantityOnHand: bucketQuantityOnHand(values),
      cfoQuantity: jobStock?.cfoQuantity ?? 0,
      drawnBucketQuantity: drawnBucketQuantity(jobStock, values.lengthMm),
      drawnQuantity: jobStock?.drawnQuantity ?? 0,
    };
  }

  /**
   * The same judgement the ledger applies on post (`@pkg/domain`), run against what this dialog has
   * loaded so the reader sees it before committing rather than only afterwards.
   */
  function movementWarnings(values: ReturnStockFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity) || values.partId === '') return [];

    // Until the target's stock arrives, every figure reads zero, which would warn on any return at all.
    // Staying quiet is the honest state: the post still returns the ledger's own verdict.
    if (values.target === 'quote') {
      if (values.quoteId === '' || quoteStockQuery.isPending) return [];
      const quoteStock = quoteStockQuery.data?.items.find((row) => row.partId === values.partId);

      return deriveMovementWarnings({
        facts: { drawnBucketQuantity: drawnBucketQuantity(quoteStock, values.lengthMm), kind: 'return-to-store' },
        quantity: values.quantity,
      });
    }
    if (values.jobId === '' || jobStockQuery.isPending) return [];

    return deriveMovementWarnings({
      facts: { ...movementFacts(values), kind: 'return-to-store' },
      quantity: values.quantity,
    });
  }

  return (
    <CreateEntityDialog<ReturnStockFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{
        jobId: fixedJob?.id ?? '',
        lengthMm: Number.NaN,
        partId: defaultPartId,
        quantity: Number.NaN,
        quoteId: fixedQuote?.id ?? '',
        target: fixedQuote ? 'quote' : 'job',
      }}
      description="Return a previously drawn Part to store."
      onCreate={(values) => {
        const part = parts.find((candidate) => candidate.partId === values.partId);
        if (!part) throw new Error('Select a Part');

        movementWarningsOutcome.acknowledge(movementWarnings(values));
        return returnMutation.mutateAsync(toReturnStockInput(values, part));
      }}
      onCreated={async (result) => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Stock returned to store');
        movementWarningsOutcome.reconcile(result.warnings);
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={(values) => (movementWarnings(values).length > 0 ? 'Return anyway' : 'Return stock')}
      title="Return stock"
      validator={validator}
    >
      {(form) => (
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const part = parts.find((candidate) => candidate.partId === values.partId);

            return (
              <>
                {!isFixed ? (
                  <Field>
                    <FieldLabel>Returned from</FieldLabel>
                    <Tabs
                      onValueChange={(value) => {
                        form.setFieldValue('target', value as ReturnStockTarget);
                        form.setFieldValue('jobId', '');
                        form.setFieldValue('quoteId', '');
                        setSelectedJob(null);
                        setSelectedQuote(null);
                      }}
                      value={values.target}
                    >
                      <TabsList className="w-full">
                        <TabsTrigger className="flex-1" value="job">
                          Job
                        </TabsTrigger>
                        <TabsTrigger className="flex-1" value="quote">
                          Parts Sale
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Field>
                ) : null}

                {fixedJob ? (
                  <Field>
                    <FieldLabel>Job</FieldLabel>
                    <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedJob.code}</div>
                  </Field>
                ) : fixedQuote ? (
                  <Field>
                    <FieldLabel>Parts Sale</FieldLabel>
                    <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedQuote.code}</div>
                  </Field>
                ) : values.target === 'quote' ? (
                  <form.AppField name="quoteId">
                    {(field) => (
                      <Field data-invalid={field.state.meta.errors.length > 0}>
                        <FieldLabel htmlFor="inventory-return-quote">Parts Sale</FieldLabel>
                        <InventoryQuotePicker
                          controller={quotePicker}
                          inputId="inventory-return-quote"
                          onSelected={(quote) => {
                            setSelectedQuote(quote);
                            field.handleChange(quote?.id ?? '');
                          }}
                          value={selectedQuote}
                        />
                      </Field>
                    )}
                  </form.AppField>
                ) : (
                  <form.AppField name="jobId">
                    {(field) => (
                      <Field data-invalid={field.state.meta.errors.length > 0}>
                        <FieldLabel htmlFor="inventory-job-movement-job">Job</FieldLabel>
                        <JobPicker
                          controller={jobPicker}
                          nothingPickableMessage="No Jobs are available for this movement."
                          onOpenChange={setJobPickerOpen}
                          onSelect={(job) => {
                            setSelectedJob(job);
                            field.handleChange(job.id);
                          }}
                          open={isJobPickerOpen}
                          value={selectedJob}
                        >
                          <JobPickerTrigger
                            className="w-full"
                            id="inventory-job-movement-job"
                            placeholder="Select Job"
                            value={selectedJob}
                          />
                        </JobPicker>
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
                      resolveInputOnEnter={(inputValue) => partIdFromScanToken(parts, inputValue)}
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
      )}
    </CreateEntityDialog>
  );
}

/** What a Job or Parts Sale still holds in one bucket: the whole Part for unbucketed stock, else one length. */
function drawnBucketQuantity(
  row: { drawnQuantity: number; lengthBuckets: readonly JobStockLengthBucket[] } | undefined,
  lengthMm: number,
): number {
  if (Number.isNaN(lengthMm)) return row?.drawnQuantity ?? 0;

  return row?.lengthBuckets.find((candidate) => candidate.lengthMm === lengthMm)?.drawnQuantity ?? 0;
}
