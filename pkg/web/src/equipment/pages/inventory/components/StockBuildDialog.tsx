import type { StockMovementWarningCode, StockOnHandRow } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useMovementWarnings } from '@/equipment/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';
import {
  deriveStockBuildRows,
  deriveStockBuildWarnings,
  type StockBuildFormValues,
  StockBuildFormValues as StockBuildFormValuesSchema,
  toBuildInput,
} from './types.js';

/**
 * Posts one build. The consumption prefills at BOM × N and is edited to what actually left the rack;
 * a deviation warns and posts, and a short rack goes negative — the build already happened.
 *
 * The size and every keyed row are form values, so one subscription derives the rows, the warnings
 * and the submit label from the same snapshot; `deriveStockBuildRows` holds the edits as overrides,
 * so changing the build size re-prefills every row nobody has touched. The Built Part stays outside
 * the form because it is a query key — the BOM is fetched for whatever is selected.
 */
export function StockBuildDialog({
  buildableParts,
  items,
  onOpenChange,
  open,
}: {
  buildableParts: readonly StockOnHandRow[];
  items: readonly StockOnHandRow[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [builtPartId, setBuiltPartId] = useState(buildableParts[0]?.partId ?? '');
  const movementWarnings = useMovementWarnings();
  const bomQuery = useQuery(trpc.parts.bom.queryOptions({ partId: builtPartId }, { enabled: builtPartId !== '' }));

  const bomLines = useMemo(
    () =>
      (bomQuery.data?.lines ?? []).map((line) => ({ componentPartId: line.componentPartId, quantity: line.quantity })),
    [bomQuery.data?.lines],
  );

  const mutation = useMutation(
    trpc.inventory.postBuild.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to post this build.'),
    }),
  );

  function rowsFor(values: StockBuildFormValues) {
    return deriveStockBuildRows({ bomLines, items, values });
  }

  /**
   * Until the BOM arrives every figure reads zero, which would warn on any build at all, so the
   * screen stays quiet. The post still returns the ledger's own verdict either way.
   */
  function warningsFor(values: StockBuildFormValues) {
    return bomQuery.isPending
      ? []
      : deriveStockBuildWarnings({ bomLines, quantity: values.quantity, rows: rowsFor(values) });
  }

  return (
    <CreateEntityDialog<StockBuildFormValues, { warnings: Array<{ codes: StockMovementWarningCode[] }> }>
      // The one fact the form schema cannot see: an unknown BOM is indistinguishable from an empty
      // one once it reaches the server, and the ledger rows it would write cannot be undone.
      canSubmit={builtPartId !== '' && !bomQuery.error && !bomQuery.isPending}
      defaultValues={{ consumption: {}, quantity: 1 }}
      description="Record what came off the rack, and what it took to make it."
      onCreate={(values) => {
        movementWarnings.acknowledge(warningsFor(values));

        return mutation.mutateAsync(toBuildInput(builtPartId, rowsFor(values), values.quantity));
      }}
      onCreated={async (result) => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Build posted');
        movementWarnings.reconcile([...new Set(result.warnings.flatMap((warning) => warning.codes))]);
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={(values) => (warningsFor(values).length > 0 ? 'Build anyway' : 'Post build')}
      title="Build stock"
      validator={StockBuildFormValuesSchema}
    >
      {(form) => (
        <>
          <Field>
            <FieldLabel htmlFor="stock-build-part">Built Part</FieldLabel>
            <SearchableCombobox
              emptyMessage="No built Parts found."
              inputId="stock-build-part"
              onValueChange={(partId) => {
                setBuiltPartId(partId);
                // A different Part has different components, so held edits no longer mean anything.
                form.setFieldValue('consumption', {});
              }}
              options={buildableParts.map((part) => ({
                label: `${part.partCode} · ${part.partName}`,
                value: part.partId,
              }))}
              placeholder="Search parts"
              value={builtPartId}
            />
          </Field>
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Units built" min={0.001} step="0.001" />}
          </form.AppField>
          {bomQuery.isPending ? (
            <p className="text-muted-foreground text-sm">Loading the Bill of Materials...</p>
          ) : null}
          {bomQuery.error ? (
            <p className="text-destructive text-sm">
              Unable to load the Bill of Materials, so this build cannot be posted.
            </p>
          ) : null}
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const rows = rowsFor(values);

              return (
                <>
                  {rows.length === 0 && !bomQuery.isPending && !bomQuery.error ? (
                    <p className="text-muted-foreground text-sm">
                      No components to consume. This Part is made from raw material alone.
                    </p>
                  ) : null}
                  {rows.map((row) => (
                    <form.AppField key={row.componentPartId} name={`consumption.${row.componentPartId}`}>
                      {(field) => (
                        <Field data-invalid={field.state.meta.errors.length > 0}>
                          <FieldLabel htmlFor={`stock-build-${row.componentPartId}`}>
                            {labelFor(items, row.componentPartId)}
                          </FieldLabel>
                          <Input
                            id={`stock-build-${row.componentPartId}`}
                            inputMode="decimal"
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            value={row.keyedQuantity}
                          />
                          {field.state.meta.errors.length > 0 ? <FieldError errors={field.state.meta.errors} /> : null}
                        </Field>
                      )}
                    </form.AppField>
                  ))}
                  <StockMovementWarningPrompt warnings={warningsFor(values)} />
                </>
              );
            }}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}

function labelFor(items: readonly StockOnHandRow[], partId: string): string {
  const row = items.find((item) => item.partId === partId);

  return row ? `${row.partCode} · ${row.partName}` : 'Component';
}
