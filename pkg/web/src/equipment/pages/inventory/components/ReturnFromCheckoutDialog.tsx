import { formatDate, formatNumber } from '@pkg/domain';
import { deriveMovementWarnings } from '@pkg/domain/equipment';
import type { SourceCheckoutOption, StockMovementWarningCode } from '@pkg/schema/equipment';
import { keepPreviousData, useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import { cursorInfiniteQueryOptions } from '@/components/data-table/cursor-query.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { useCursorOptions } from '@/equipment/hooks/options/index.js';
import { useMovementWarnings } from '@/equipment/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';
import {
  type ReturnFromCheckoutFormValues,
  returnFromCheckoutValidator,
  toReturnFromCheckoutInput,
  wholeUnitQuantityMessage,
} from './types.js';

const SOURCE_PAGE_SIZE = 20;

/**
 * A Return to Store against a Checkout Without a Job. The source Checkout fixes the Part, length and
 * Recipient, so all the form asks is which Checkout and how much of it is coming back.
 */
export function ReturnFromCheckoutDialog({
  defaultSourceCheckoutId = '',
  onOpenChange,
  open,
  partId,
}: {
  /** Pre-selects the Checkout, so a history row can open straight onto the return it invites. */
  defaultSourceCheckoutId?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Narrows the Checkouts offered to one Part's, as a Part's history page does. */
  partId?: string;
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const movementWarningsOutcome = useMovementWarnings();
  const sources = useCursorOptions((search) =>
    trpc.inventory.sourceCheckouts.infiniteQueryOptions(
      // One Part holds few Checkouts Without a Job, so its list is read whole — which is also what
      // keeps a pre-selected Checkout among the options rather than on some later page.
      { limit: partId === undefined ? SOURCE_PAGE_SIZE : 0, partId, search },
      { ...cursorInfiniteQueryOptions, enabled: open, placeholderData: keepPreviousData },
    ),
  );
  const validator = useMemo(() => returnFromCheckoutValidator(sources.items), [sources.items]);
  const mutation = useMutation(
    trpc.inventory.postReturnToStore.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to return stock.'),
    }),
  );

  function sourceFor(values: ReturnFromCheckoutFormValues): SourceCheckoutOption | null {
    return sources.items.find((candidate) => candidate.id === values.sourceCheckoutId) ?? null;
  }

  /** The ledger's own judgement, run against the outstanding quantity the picker already carries. */
  function movementWarnings(values: ReturnFromCheckoutFormValues): StockMovementWarningCode[] {
    const source = sourceFor(values);
    if (!source || !Number.isFinite(values.quantity)) return [];

    return deriveMovementWarnings({
      facts: { drawnBucketQuantity: source.quantity - source.returnedQuantity, kind: 'return-to-store' },
      quantity: values.quantity,
    });
  }

  return (
    <CreateEntityDialog<ReturnFromCheckoutFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{ quantity: Number.NaN, sourceCheckoutId: defaultSourceCheckoutId }}
      description="Return a Part that was checked out without a Job."
      onCreate={(values) => {
        movementWarningsOutcome.acknowledge(movementWarnings(values));
        return mutation.mutateAsync(toReturnFromCheckoutInput(values));
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
      title="Return to store"
      validator={validator}
    >
      {(form) => (
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            const source = sourceFor(values);

            return (
              <>
                <form.AppField name="sourceCheckoutId">
                  {(field) => {
                    const errors = getFieldErrors(field.state.meta.errors);

                    return (
                      <Field data-invalid={errors.length > 0}>
                        <FieldLabel htmlFor={field.name}>Original Checkout</FieldLabel>
                        <EntityCombobox
                          disabled={sources.isPending}
                          emptyMessage="No Checkouts without a Job found."
                          inputId={field.name}
                          inputValue={sources.search}
                          isFetching={sources.isFetching}
                          itemToLabel={sourceCheckoutLabel}
                          loadMore={{
                            hasNextPage: sources.hasNextPage,
                            isFetchingNextPage: sources.isFetchingNextPage,
                            loadedCount: sources.items.length,
                            onLoadMore: sources.loadMore,
                            total: sources.total,
                            totalLabel: (total) => `${total} ${total === 1 ? 'Checkout' : 'Checkouts'}`,
                          }}
                          onInputValueChange={sources.setSearch}
                          onSelected={(next) => {
                            field.handleChange(next?.id ?? '');
                            sources.setSearch('');
                            // The selection commits first; defer until the form exposes the new source to the dependent validator.
                            queueMicrotask(() => void form.validateField('quantity', 'blur'));
                          }}
                          options={sources.items}
                          placeholder="Select original Checkout"
                          renderItem={sourceCheckoutLabel}
                          searchPlaceholder="Search by Part, recipient, or purpose"
                          value={source}
                        />
                        <FieldError errors={errors} />
                      </Field>
                    );
                  }}
                </form.AppField>
                <form.AppField
                  name="quantity"
                  validators={{
                    onBlur: ({ value }) => (source ? wholeUnitQuantityMessage(value, source.unitOfMeasure) : undefined),
                  }}
                >
                  {(field) => <field.NumberField label="Quantity" min={0.001} step="0.001" />}
                </form.AppField>
                <StockMovementWarningPrompt warnings={movementWarnings(values)} />
              </>
            );
          }}
        </form.Subscribe>
      )}
    </CreateEntityDialog>
  );
}

function sourceCheckoutLabel(item: SourceCheckoutOption) {
  return `${formatDate(item.createdAt, 'medium')} · ${item.partCode} · ${item.recipientName} · ${item.note} · ${formatNumber(item.returnedQuantity)}/${formatNumber(item.quantity)} returned`;
}
