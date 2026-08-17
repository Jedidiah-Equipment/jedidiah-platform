import type { PartBomLine, UUID } from '@pkg/schema';
import { SavePartBomInput } from '@pkg/schema';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/** `key` is a stable client-side identity: a fresh row has no component chosen yet. */
type DraftLine = { componentPartId: string; key: string; quantity: string };

/**
 * A built Part's components. An empty BOM is legitimate — that is the trivial build of a Part whose
 * components are all raw material, which posts nothing when built (spec §6).
 *
 * The loaded BOM seeds the editor's initial rows and is never written back into them: the save
 * invalidates `parts`, and a refetch landing mid-edit must not silently discard what is being typed.
 * A different Part is a different editor, which the `key` says outright.
 *
 * That holds for a refetch that *fails* too, which is why the error is rendered beside the editor
 * rather than in place of it. React Query keeps the last data and sets `error` on a failed
 * background refetch — with `refetchOnWindowFocus` on, an alt-tab onto an expired session is enough
 * — and unmounting the editor there would throw away exactly the rows this split exists to keep.
 */
export function PartBomTab({ canEdit, partId }: { canEdit: boolean; partId: UUID }) {
  const trpc = useTRPC();
  const bomQuery = useQuery(trpc.parts.bom.queryOptions({ partId }));

  if (bomQuery.isPending) return <Skeleton className="h-32 w-full" />;
  if (!bomQuery.data) return <p className="text-destructive text-sm">Unable to load the Bill of Materials.</p>;

  return (
    <div className="grid gap-4">
      {bomQuery.error ? (
        <p className="text-destructive text-sm">
          Could not refresh the Bill of Materials. You are still editing the last loaded version.
        </p>
      ) : null}
      <PartBomEditor canEdit={canEdit} initialLines={bomQuery.data.lines} key={partId} partId={partId} />
    </div>
  );
}

function PartBomEditor({
  canEdit,
  initialLines,
  partId,
}: {
  canEdit: boolean;
  initialLines: readonly PartBomLine[];
  partId: UUID;
}) {
  const trpc = useTRPC();
  const { invalidateParts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const partsQuery = useQuery(trpc.parts.list.queryOptions({ limit: 0 }));
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines.map(toDraftLine));

  const saveMutation = useMutation(
    trpc.parts.saveBom.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to save the Bill of Materials.'),
      onSuccess: async () => {
        await invalidateParts();
        toast.success('Bill of Materials saved');
      },
    }),
  );

  // A Part cannot be a component of itself, and the walk on save refuses deeper loops too.
  const componentOptions = (partsQuery.data?.items ?? []).filter((part) => part.id !== partId);
  // The whole payload is checked by the schema that owns it — component ids, quantities, and the
  // repeated-component rule — rather than by a local restatement that could drift from it.
  const draft = { lines: lines.map(toSaveLine), partId };
  const isSavable = SavePartBomInput.safeParse(draft).success;

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
            <SearchableCombobox
              disabled={!canEdit}
              emptyMessage="No Parts found."
              inputId={`bom-component-${index}`}
              onValueChange={(componentPartId) => updateLine(setLines, index, { componentPartId })}
              options={componentOptions.map((part) => ({
                label: `${part.code} · ${part.name}`,
                value: part.id,
              }))}
              placeholder="Search parts"
              value={line.componentPartId}
            />
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
            disabled={saveMutation.isPending || !isSavable}
            onClick={() => {
              void saveMutation.mutateAsync(draft).catch(() => undefined);
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

function toSaveLine(line: DraftLine) {
  return { componentPartId: line.componentPartId, quantity: Number(line.quantity) };
}
