import { deriveBuildConsumption, deriveBuildWarnings } from '@pkg/domain';
import type { StockMovementWarningCode, StockOnHandRow, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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

type ConsumptionDraft = { componentPartId: string; lengthMm: number | null; quantity: string };

/**
 * Posts one build. The consumption prefills at BOM × N and is edited to what actually left the rack;
 * a deviation warns and posts, and a short rack goes negative — the build already happened.
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
  const builtPart = buildableParts.find((part) => part.partId === builtPartId);
  const bomQuery = useQuery(
    trpc.parts.bom.queryOptions({ partId: builtPartId as UUID }, { enabled: builtPartId !== '' }),
  );
  const [quantity, setQuantity] = useState('1');
  const [consumption, setConsumption] = useState<ConsumptionDraft[]>([]);

  const bomLines = useMemo(
    () =>
      (bomQuery.data?.lines ?? []).map((line) => ({ componentPartId: line.componentPartId, quantity: line.quantity })),
    [bomQuery.data?.lines],
  );

  useEffect(() => {
    const buildQuantity = Number(quantity);
    if (!Number.isFinite(buildQuantity) || buildQuantity <= 0) return;

    setConsumption(
      deriveBuildConsumption({ bomLines, quantity: buildQuantity }).map((line) => ({
        componentPartId: line.componentPartId,
        lengthMm: standardLengthOf(items, line.componentPartId),
        quantity: String(line.quantity),
      })),
    );
  }, [bomLines, items, quantity]);

  const mutation = useMutation(
    trpc.inventory.postBuild.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to post this build.'),
    }),
  );

  const warnings = consumption.flatMap((line) =>
    deriveBuildWarnings({
      expectedQuantity:
        (bomLines.find((bom) => bom.componentPartId === line.componentPartId)?.quantity ?? 0) * Number(quantity),
      quantity: Number(line.quantity),
      quantityOnHand: bucketOnHandOf(items, line.componentPartId, line.lengthMm),
    }),
  );
  const uniqueWarnings = [...new Set(warnings)] as StockMovementWarningCode[];

  return (
    <CreateEntityDialog<StockBuildFormValues, { warnings: Array<{ codes: StockMovementWarningCode[] }> }>
      defaultValues={{ quantity: 1 }}
      description="Record what came off the rack, and what it took to make it."
      onCreate={() =>
        mutation.mutateAsync({
          builtPartId: builtPartId as UUID,
          consumption: consumption.map((line) => ({
            componentPartId: line.componentPartId as UUID,
            lengthMm: line.lengthMm,
            quantity: Number(line.quantity),
          })),
          quantity: Number(quantity),
        })
      }
      onCreated={async (result) => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Build posted');
        // The prompt already showed what the dialog could see; only raise what its snapshot missed.
        for (const code of new Set(result.warnings.flatMap((warning) => warning.codes))) {
          if (!uniqueWarnings.includes(code)) toast.warning(warningMessageFor(code));
        }
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={uniqueWarnings.length > 0 ? 'Build anyway' : 'Post build'}
      title="Build stock"
      validator={StockBuildFormValuesSchema}
    >
      {() => (
        <>
          <Field>
            <FieldLabel htmlFor="stock-build-part">Built Part</FieldLabel>
            <Select onValueChange={(partId) => setBuiltPartId(partId ?? '')} value={builtPartId}>
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
          <Field>
            <FieldLabel htmlFor="stock-build-quantity">Units built</FieldLabel>
            <Input
              id="stock-build-quantity"
              inputMode="decimal"
              onChange={(event) => setQuantity(event.target.value)}
              value={quantity}
            />
          </Field>
          {bomQuery.isPending ? (
            <p className="text-muted-foreground text-sm">Loading the Bill of Materials...</p>
          ) : null}
          {consumption.length === 0 && !bomQuery.isPending ? (
            <p className="text-muted-foreground text-sm">
              No components to consume. This Part is made from raw material alone.
            </p>
          ) : null}
          {consumption.map((line, index) => (
            <Field key={line.componentPartId}>
              <FieldLabel htmlFor={`stock-build-component-${index}`}>
                {labelFor(items, line.componentPartId)}
              </FieldLabel>
              <Input
                id={`stock-build-component-${index}`}
                inputMode="decimal"
                onChange={(event) =>
                  setConsumption((current) =>
                    current.map((draft, at) => (at === index ? { ...draft, quantity: event.target.value } : draft)),
                  )
                }
                value={line.quantity}
              />
            </Field>
          ))}
          <StockMovementWarningPrompt warnings={uniqueWarnings} />
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
