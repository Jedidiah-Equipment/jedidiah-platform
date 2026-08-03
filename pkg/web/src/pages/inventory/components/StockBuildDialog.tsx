import { deriveBuildConsumption, deriveBuildWarnings } from '@pkg/domain';
import type { StockMovementWarningCode, StockOnHandRow } from '@pkg/schema';
import { PostBuildInput } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementWarningPrompt, warningMessageFor } from './StockMovementWarningPrompt.js';
import { type StockBuildFormValues, StockBuildFormValues as StockBuildFormValuesSchema } from './types.js';

type ConsumptionLine = {
  componentPartId: string;
  expectedQuantity: number;
  lengthMm: number | null;
  quantity: string;
};

/**
 * Posts one build. The consumption prefills at BOM × N and is edited to what actually left the rack;
 * a deviation warns and posts, and a short rack goes negative — the build already happened.
 *
 * Edits are held per component rather than as a copied list, so changing the build size re-prefills
 * every line the builder has not touched without discarding the ones they have.
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
  const [edits, setEdits] = useState<Record<string, string>>({});
  const builtPart = buildableParts.find((part) => part.partId === builtPartId);
  const bomQuery = useQuery(trpc.parts.bom.queryOptions({ partId: builtPartId }, { enabled: builtPartId !== '' }));

  const bomLines = useMemo(
    () =>
      (bomQuery.data?.lines ?? []).map((line) => ({
        componentPartId: line.componentPartId,
        quantity: line.quantity,
      })),
    [bomQuery.data?.lines],
  );

  const mutation = useMutation(
    trpc.inventory.postBuild.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to post this build.'),
    }),
  );

  function consumptionFor(quantity: number): ConsumptionLine[] {
    return deriveBuildConsumption({ bomLines, quantity }).map((line) => ({
      componentPartId: line.componentPartId,
      expectedQuantity: line.quantity,
      lengthMm: standardLengthOf(items, line.componentPartId),
      quantity: edits[line.componentPartId] ?? String(line.quantity),
    }));
  }

  /**
   * The same judgement the ledger applies on post, run against what this dialog has loaded so the
   * builder sees it before committing rather than only afterwards. Until the BOM arrives every
   * figure reads zero, which would warn on any build at all, so it stays quiet.
   */
  function warningsFor(quantity: number): StockMovementWarningCode[] {
    if (bomQuery.isPending || !Number.isFinite(quantity)) return [];

    return [
      ...new Set(
        consumptionFor(quantity).flatMap((line) =>
          deriveBuildWarnings({
            expectedQuantity: line.expectedQuantity,
            quantity: Number(line.quantity),
            quantityOnHand: bucketOnHandOf(items, line.componentPartId, line.lengthMm),
          }),
        ),
      ),
    ];
  }

  return (
    <CreateEntityDialog<StockBuildFormValues, { warnings: Array<{ codes: StockMovementWarningCode[] }> }>
      defaultValues={{ quantity: 1 }}
      description="Record what came off the rack, and what it took to make it."
      onCreate={(values) => {
        if (builtPartId === '') throw new Error('Select a Part to build');

        return mutation.mutateAsync(
          PostBuildInput.parse({
            builtPartId,
            consumption: consumptionFor(values.quantity).map((line) => ({
              componentPartId: line.componentPartId,
              lengthMm: line.lengthMm,
              quantity: Number(line.quantity),
            })),
            quantity: values.quantity,
          }),
        );
      }}
      onCreated={async (result) => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Build posted');
        // The prompt already showed what the dialog could see; only raise what its snapshot missed.
        const raised = new Set(warningsFor(1));
        for (const code of new Set(result.warnings.flatMap((warning) => warning.codes))) {
          if (!raised.has(code)) toast.warning(warningMessageFor(code));
        }
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={(values) => (warningsFor(values.quantity).length > 0 ? 'Build anyway' : 'Post build')}
      title="Build stock"
      validator={StockBuildFormValuesSchema}
    >
      {(form) => (
        <>
          <Field>
            <FieldLabel htmlFor="stock-build-part">Built Part</FieldLabel>
            <Select
              onValueChange={(partId) => {
                setBuiltPartId(partId ?? '');
                // A different Part has different components, so held edits no longer mean anything.
                setEdits({});
              }}
              value={builtPartId}
            >
              <SelectTrigger className="w-full" id="stock-build-part">
                <SelectValue placeholder="Select Part">
                  {builtPart ? `${builtPart.partCode} · ${builtPart.partName}` : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {buildableParts.map((part) => (
                    <SelectItem key={part.partId} value={part.partId}>
                      {part.partCode} · {part.partName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Units built" min={0.001} step="0.001" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.quantity}>
            {(quantity) => {
              const consumption = Number.isFinite(quantity) ? consumptionFor(quantity) : [];

              return (
                <>
                  {bomQuery.isPending ? (
                    <p className="text-muted-foreground text-sm">Loading the Bill of Materials...</p>
                  ) : null}
                  {consumption.length === 0 && !bomQuery.isPending ? (
                    <p className="text-muted-foreground text-sm">
                      No components to consume. This Part is made from raw material alone.
                    </p>
                  ) : null}
                  {consumption.map((line) => (
                    <Field key={line.componentPartId}>
                      <FieldLabel htmlFor={`stock-build-${line.componentPartId}`}>
                        {labelFor(items, line.componentPartId)}
                      </FieldLabel>
                      <Input
                        id={`stock-build-${line.componentPartId}`}
                        inputMode="decimal"
                        onChange={(event) =>
                          setEdits((current) => ({ ...current, [line.componentPartId]: event.target.value }))
                        }
                        value={line.quantity}
                      />
                    </Field>
                  ))}
                  <StockMovementWarningPrompt warnings={warningsFor(quantity)} />
                </>
              );
            }}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}

function rowFor(items: readonly StockOnHandRow[], partId: string): StockOnHandRow | undefined {
  return items.find((item) => item.partId === partId);
}

function labelFor(items: readonly StockOnHandRow[], partId: string): string {
  const row = rowFor(items, partId);

  return row ? `${row.partCode} · ${row.partName}` : 'Component';
}

/** Linear components are consumed out of their standard purchase bucket unless the builder says otherwise. */
function standardLengthOf(items: readonly StockOnHandRow[], partId: string): number | null {
  const row = rowFor(items, partId);

  return row?.unitOfMeasure === 'mm' ? row.standardPurchaseLengthMm : null;
}

function bucketOnHandOf(items: readonly StockOnHandRow[], partId: string, lengthMm: number | null): number {
  return rowFor(items, partId)?.buckets.find((bucket) => bucket.lengthMm === lengthMm)?.quantity ?? 0;
}
