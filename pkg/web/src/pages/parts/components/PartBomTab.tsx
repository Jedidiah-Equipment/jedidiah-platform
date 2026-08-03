import type { PartBomLine, UUID } from '@pkg/schema';
import { PartBomQuantity } from '@pkg/schema';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/** `key` is a stable client-side identity: a fresh row has no component chosen yet. */
type DraftLine = { componentPartId: string; key: string; quantity: string };

/**
 * A built Part's components. An empty BOM is legitimate — that is the trivial build of a Part whose
 * components are all raw material, which posts nothing when built (spec §6).
 */
export function PartBomTab({ canEdit, partId }: { canEdit: boolean; partId: UUID }) {
  const trpc = useTRPC();
  const { invalidateParts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const bomQuery = useQuery(trpc.parts.bom.queryOptions({ partId }));
  const partsQuery = useQuery(trpc.parts.list.queryOptions({ limit: 0 }));
  const [lines, setLines] = useState<DraftLine[]>([]);

  useEffect(() => {
    if (bomQuery.data) setLines(bomQuery.data.lines.map(toDraftLine));
  }, [bomQuery.data]);

  const saveMutation = useMutation(
    trpc.parts.saveBom.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to save the Bill of Materials.'),
      onSuccess: async () => {
        await invalidateParts();
        toast.success('Bill of Materials saved');
      },
    }),
  );

  if (bomQuery.isPending) return <Skeleton className="h-32 w-full" />;
  if (bomQuery.error) return <p className="text-destructive text-sm">Unable to load the Bill of Materials.</p>;

  // A Part cannot be a component of itself, and the walk on save refuses deeper loops too.
  const componentOptions = (partsQuery.data?.items ?? []).filter((part) => part.id !== partId);

  return (
    <div className="grid gap-4">
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No components. A built Part with no BOM is made from raw material alone, which posts nothing.
        </p>
      ) : null}
      {lines.map((line, index) => (
        <div key={line.key} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
          <Field>
            <FieldLabel htmlFor={`bom-component-${index}`}>Component</FieldLabel>
            <Select
              disabled={!canEdit}
              onValueChange={(componentPartId) =>
                updateLine(setLines, index, { componentPartId: componentPartId ?? '' })
              }
              value={line.componentPartId}
            >
              <SelectTrigger className="w-full" id={`bom-component-${index}`}>
                <SelectValue placeholder="Select Part" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {componentOptions.map((part) => (
                    <SelectItem key={part.id} value={part.id}>
                      {part.code} · {part.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`bom-quantity-${index}`}>Quantity</FieldLabel>
            <Input
              disabled={!canEdit}
              id={`bom-quantity-${index}`}
              inputMode="decimal"
              onChange={(event) => updateLine(setLines, index, { quantity: event.target.value })}
              value={line.quantity}
            />
          </Field>
          {canEdit ? (
            <Button
              aria-label="Remove component"
              onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
              size="icon"
              variant="ghost"
            >
              <IconTrash />
            </Button>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              setLines((current) => [...current, { componentPartId: '', key: crypto.randomUUID(), quantity: '1' }])
            }
            variant="outline"
          >
            <IconPlus data-icon="inline-start" />
            Add component
          </Button>
          <Button
            disabled={saveMutation.isPending || lines.some((line) => !isCompleteLine(line))}
            onClick={() => {
              void saveMutation.mutateAsync({ lines: lines.map(toSaveLine), partId }).catch(() => undefined);
            }}
          >
            Save Bill of Materials
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function updateLine(
  setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>,
  index: number,
  patch: Partial<DraftLine>,
): void {
  setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
}

function toDraftLine(line: PartBomLine): DraftLine {
  return { componentPartId: line.componentPartId, key: line.componentPartId, quantity: String(line.quantity) };
}

/** The quantity rule lives in `@pkg/schema`; re-stating it here is how the two drift apart. */
function isCompleteLine(line: DraftLine): boolean {
  return line.componentPartId !== '' && PartBomQuantity.safeParse(Number(line.quantity)).success;
}

function toSaveLine(line: DraftLine) {
  return { componentPartId: line.componentPartId, quantity: Number(line.quantity) };
}
