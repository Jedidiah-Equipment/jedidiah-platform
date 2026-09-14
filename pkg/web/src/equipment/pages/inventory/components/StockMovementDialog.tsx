import { useDebouncedValue } from '@mantine/hooks';
import { formatDate, formatNumber } from '@pkg/domain';
import { deriveMovementWarnings, type JobMovementFacts } from '@pkg/domain/equipment';
import type {
  InventoryRecipientOption,
  JobPickerOption,
  JobStockMovementType,
  JobStockRow,
  SourceCheckoutOption,
  StockMovementWarningCode,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import { PostCheckoutInput, PostReturnToStoreInput } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EntityCombobox, mergeSelectedOption } from '@/components/common/EntityCombobox.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { JobPicker, JobPickerTrigger } from '@/equipment/components/job-picker/index.js';
import { useInventoryJobPicker } from '@/equipment/hooks/options/index.js';
import { useMovementWarnings } from '@/equipment/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';
import {
  partIdFromScanToken,
  partQuantityValidationMessage,
  partSelectOptions,
  type StockMovementFormValues,
  type StockPartOption,
  stockMovementValidator,
  switchStockMovementTarget,
  toStockMovementInput,
} from './types.js';

type FixedJob = { code: string; id: string };

export function StockMovementDialog({
  defaultPartId = '',
  defaultSourceCheckout = null,
  defaultSourceCheckoutId = '',
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
  defaultSourceCheckout?: SourceCheckoutOption | null;
  defaultSourceCheckoutId?: string;
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
  const { data: session } = authClient.useSession();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isJobPickerOpen, setJobPickerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPickerOption | null>(null);
  const [selectedSourceCheckout, setSelectedSourceCheckout] = useState<SourceCheckoutOption | null>(
    defaultSourceCheckout,
  );
  const [sourceLookupEnabled, setSourceLookupEnabled] = useState(defaultSourceCheckoutId !== '');
  const [sourceSearch, setSourceSearch] = useState('');
  const [debouncedSourceSearch] = useDebouncedValue(sourceSearch, 250);
  const movementWarningsOutcome = useMovementWarnings();
  const validator = useMemo(() => stockMovementValidator(parts, type), [parts, type]);
  const verb = type === 'checkout' ? 'Check out' : 'Return';
  const jobId = fixedJob?.id ?? selectedJob?.id ?? '';

  const jobPicker = useInventoryJobPicker({ enabled: fixedJob === undefined, movementType: type });
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }, { enabled: jobId !== '' }));
  const recipientQuery = useQuery(trpc.inventory.recipientOptions.queryOptions({ limit: 0, search: '' }));
  const sourceCheckoutQuery = useInfiniteQuery(
    trpc.inventory.sourceCheckouts.infiniteQueryOptions(
      {
        limit: 20,
        partId: defaultPartId === '' ? undefined : defaultPartId,
        search: debouncedSourceSearch,
      },
      {
        ...cursorInfiniteQueryOptions,
        enabled: open && type === 'return-to-store' && sourceLookupEnabled,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const sourceCheckoutPage = useCombinedCursorQueryPages(sourceCheckoutQuery.data?.pages);
  const sourceCheckoutItems = mergeSelectedOption(sourceCheckoutPage.items, selectedSourceCheckout);
  const checkoutMutation = useMutation(
    trpc.inventory.postCheckout.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to check stock out.'),
    }),
  );
  const returnMutation = useMutation(
    trpc.inventory.postReturnToStore.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to return stock.'),
    }),
  );

  function movementFacts(values: StockMovementFormValues): JobMovementFacts {
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
  function movementWarnings(values: StockMovementFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity)) return [];
    if (values.mode === 'person') {
      if (type === 'return-to-store') {
        const source = sourceCheckoutItems.find((item) => item.id === values.sourceCheckoutId);
        if (!source) return [];
        return deriveMovementWarnings({
          facts: {
            kind: 'return-without-job',
            outstandingQuantity: Math.max(0, source.quantity - source.returnedQuantity),
          },
          quantity: values.quantity,
        });
      }
      const lengthMm = Number.isNaN(values.lengthMm) ? null : values.lengthMm;
      const bucketQuantityOnHand =
        items.find((row) => row.partId === values.partId)?.buckets.find((candidate) => candidate.lengthMm === lengthMm)
          ?.quantity ?? 0;
      return deriveMovementWarnings({
        facts: { bucketQuantityOnHand, kind: 'checkout-without-job' },
        quantity: values.quantity,
      });
    }
    if (values.jobId === '' || values.partId === '') return [];
    // Until the Job's stock arrives, every figure reads zero, which would warn on any draw at all.
    // Staying quiet is the honest state: the post still returns the ledger's own verdict.
    if (jobStockQuery.isPending) return [];

    return deriveMovementWarnings({ facts: { ...movementFacts(values), kind: type }, quantity: values.quantity });
  }

  return (
    <CreateEntityDialog<StockMovementFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{
        jobId: fixedJob?.id ?? '',
        lengthMm: Number.NaN,
        mode: defaultSourceCheckoutId === '' ? 'job' : 'person',
        note: '',
        partId: defaultPartId,
        quantity: Number.NaN,
        recipientUserId: session?.user.id ?? '',
        sourceCheckoutId: defaultSourceCheckoutId,
      }}
      description={
        type === 'checkout' ? 'Draw a Part from stock against any Job.' : 'Return a previously drawn Part to store.'
      }
      onCreate={(values) => {
        const part = parts.find((candidate) => candidate.partId === values.partId);

        movementWarningsOutcome.acknowledge(movementWarnings(values));
        const input = toStockMovementInput(values, type, part);
        return type === 'checkout'
          ? checkoutMutation.mutateAsync(PostCheckoutInput.parse(input))
          : returnMutation.mutateAsync(PostReturnToStoreInput.parse(input));
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
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const part = parts.find((candidate) => candidate.partId === values.partId);
            const showsPart = values.mode === 'job' || type === 'checkout';

            return (
              <>
                {fixedJob === undefined ? (
                  <Field>
                    <FieldLabel>Movement target</FieldLabel>
                    <Tabs
                      onValueChange={(value) => {
                        const mode = value as 'job' | 'person';
                        const nextValues = switchStockMovementTarget({
                          defaultPartId,
                          movementType: type,
                          recipientUserId: session?.user.id ?? '',
                          targetMode: mode,
                          values,
                        });
                        form.setFieldValue('mode', nextValues.mode);
                        form.setFieldValue('jobId', nextValues.jobId);
                        form.setFieldValue('lengthMm', nextValues.lengthMm);
                        form.setFieldValue('note', nextValues.note);
                        form.setFieldValue('partId', nextValues.partId);
                        form.setFieldValue('recipientUserId', nextValues.recipientUserId);
                        form.setFieldValue('sourceCheckoutId', nextValues.sourceCheckoutId);
                        setSourceLookupEnabled(mode === 'person');
                        if (mode === 'person') {
                          setSelectedJob(null);
                        } else {
                          setSelectedSourceCheckout(null);
                          setSourceSearch('');
                        }
                      }}
                      value={values.mode}
                    >
                      <TabsList className="w-full">
                        <TabsTrigger className="flex-1" value="job">
                          To a Job
                        </TabsTrigger>
                        <TabsTrigger className="flex-1" value="person">
                          Without a Job
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Field>
                ) : null}

                <Field>
                  <FieldLabel>Operator</FieldLabel>
                  <div className="rounded-md border px-3 py-2 text-sm">{session?.user.name ?? 'Signed-in user'}</div>
                </Field>

                {values.mode === 'job' ? (
                  fixedJob ? (
                    <Field>
                      <FieldLabel>Job</FieldLabel>
                      <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedJob.code}</div>
                    </Field>
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
                  )
                ) : type === 'checkout' ? (
                  <>
                    <form.AppField name="recipientUserId">
                      {(field) => (
                        <field.ComboboxField
                          emptyMessage="No active Equipment users found."
                          label="Received by"
                          options={recipientOptions(recipientQuery.data?.items ?? [])}
                          placeholder="Search people"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="note">
                      {(field) => <field.TextareaField label="Purpose" placeholder="Repair factory drill" rows={2} />}
                    </form.AppField>
                  </>
                ) : (
                  <form.AppField name="sourceCheckoutId">
                    {(field) => {
                      const errors = getFieldErrors(field.state.meta.errors);
                      return (
                        <Field data-invalid={errors.length > 0}>
                          <FieldLabel htmlFor={field.name}>Original Checkout</FieldLabel>
                          <EntityCombobox
                            disabled={sourceCheckoutQuery.isPending}
                            emptyMessage="No Checkouts without a Job found."
                            inputId={field.name}
                            inputValue={sourceSearch}
                            isFetching={sourceCheckoutQuery.isFetching}
                            itemToLabel={sourceCheckoutLabel}
                            loadMore={{
                              hasNextPage: sourceCheckoutQuery.hasNextPage,
                              isFetchingNextPage: sourceCheckoutQuery.isFetchingNextPage,
                              loadedCount: sourceCheckoutPage.items.length,
                              onLoadMore: () => void sourceCheckoutQuery.fetchNextPage(),
                              total: sourceCheckoutPage.total,
                              totalLabel: (total) => `${total} ${total === 1 ? 'Checkout' : 'Checkouts'}`,
                            }}
                            onInputValueChange={setSourceSearch}
                            onSelected={(source) => {
                              setSelectedSourceCheckout(source);
                              field.handleChange(source?.id ?? '');
                              setSourceSearch('');
                            }}
                            options={sourceCheckoutItems}
                            placeholder="Select original Checkout"
                            renderItem={(source) => sourceCheckoutLabel(source)}
                            searchPlaceholder="Search by Part, recipient, or purpose"
                            value={selectedSourceCheckout}
                          />
                          <FieldError errors={errors} />
                        </Field>
                      );
                    }}
                  </form.AppField>
                )}

                {showsPart ? (
                  <form.AppField name="partId">
                    {(field) => (
                      <field.ComboboxField
                        disabled={isLoadingParts}
                        emptyMessage="No Parts found."
                        label="Part"
                        onValueCommit={() => queueMicrotask(() => void form.validateField('quantity', 'blur'))}
                        options={partSelectOptions(parts)}
                        placeholder={isLoadingParts ? 'Loading parts...' : 'Search parts'}
                        resolveInputOnEnter={(inputValue) => partIdFromScanToken(parts, inputValue)}
                      />
                    )}
                  </form.AppField>
                ) : null}

                <form.AppField
                  name="quantity"
                  validators={{
                    onBlur: ({ value }) =>
                      showsPart
                        ? partQuantityValidationMessage({ partId: form.state.values.partId, quantity: value }, parts)
                        : undefined,
                  }}
                >
                  {(field) => <field.NumberField label="Quantity" min={0.001} step="0.001" />}
                </form.AppField>

                {showsPart && part?.unitOfMeasure === 'mm' ? (
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

function recipientOptions(items: readonly InventoryRecipientOption[]) {
  return items.map((item) => ({ label: item.name, value: item.id }));
}

function sourceCheckoutLabel(item: SourceCheckoutOption) {
  return `${formatDate(item.createdAt, 'medium')} · ${item.partCode} · ${item.recipientName} · ${item.note} · ${formatNumber(item.returnedQuantity)}/${formatNumber(item.quantity)} returned`;
}
