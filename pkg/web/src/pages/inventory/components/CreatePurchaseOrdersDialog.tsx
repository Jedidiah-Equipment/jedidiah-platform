import type { PartUnitOfMeasure } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatPurchaseUnitLabel } from '@/utils/part-quantity-format.js';

/** One offered Part on its way to a draft line. Supplier-blind: the split is the server's to make. */
export type PurchaseSelectionCandidate = {
  partCode: string;
  partId: string;
  partName: string;
  standardPurchaseLengthMm: number | null;
  suggestedQuantity: number;
  supplierName: string | null;
  unitOfMeasure: PartUnitOfMeasure;
};

type SelectionState = { include: boolean; quantity: string };

/**
 * The last look before a selection becomes drafts: what is being ordered, from whom, and how much.
 *
 * Every row is tickable and editable. Quantities prefill from the suggestion, but the number is
 * advice — the buyer knows things the shortfall does not (a pack size, a delivery promised by
 * phone). A row suggesting nothing, because free stock or an open order already covers it, arrives
 * unticked rather than hidden, so it can still be ordered deliberately without blocking the rest of
 * the selection. Prices are absent on purpose: the buy list is quantity-only under the cost gate
 * (spec §11), so the draft is where they get keyed.
 */
export function CreatePurchaseOrdersDialog({
  candidates,
  jobId = null,
  onCreated,
  onOpenChange,
  open,
}: {
  candidates: readonly PurchaseSelectionCandidate[];
  jobId?: string | null;
  onCreated?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const mutation = useMutation(trpc.purchaseOrders.createFromSelection.mutationOptions());
  const [selection, setSelection] = useState<Record<string, SelectionState>>({});
  const [isInitialised, setIsInitialised] = useState(false);

  // Prefill on the *open* transition only, never on a candidates change. A background refetch —
  // ordinary here, since queries refetch on window focus — would otherwise hand this a new list mid
  // edit and silently snap every typed quantity back to the suggestion before the buyer submits.
  if (open && !isInitialised) {
    setIsInitialised(true);
    setSelection(
      Object.fromEntries(
        candidates.map((row) => [
          row.partId,
          { include: row.suggestedQuantity > 0, quantity: String(row.suggestedQuantity) },
        ]),
      ),
    );
  }
  if (!open && isInitialised) setIsInitialised(false);

  const update = (partId: string, patch: Partial<SelectionState>) =>
    setSelection((current) => ({
      ...current,
      [partId]: { include: false, quantity: '', ...current[partId], ...patch },
    }));

  const chosen = candidates.flatMap((candidate) => {
    const state = selection[candidate.partId];

    return state?.include ? [{ candidate, quantity: Number.parseFloat(state.quantity) }] : [];
  });
  const hasInvalidQuantity = chosen.some(({ quantity }) => !Number.isFinite(quantity) || quantity <= 0);

  const handleSubmit = async () => {
    try {
      const result = await mutation.mutateAsync({
        jobId,
        lines: chosen.map(({ candidate, quantity }) => ({ partId: candidate.partId, quantity })),
      });
      await Promise.all([invalidateInventory(), invalidatePurchaseOrders()]);
      toast.success(describeCreated(result.purchaseOrders.map((purchaseOrder) => purchaseOrder.code)));
      onCreated?.();
      onOpenChange(false);
    } catch (error) {
      showMutationError(error, 'Unable to create the draft Purchase Orders.');
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Create draft Purchase Orders</DialogTitle>
          <DialogDescription>
            The selection splits into one draft per Supplier. Add prices on the drafts before sending them.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="grid gap-3">
            {candidates.map((candidate) => (
              <div className="flex items-center gap-3" key={candidate.partId}>
                <Checkbox
                  aria-label={`Include ${candidate.partCode}`}
                  checked={selection[candidate.partId]?.include ?? false}
                  onCheckedChange={(checked) => update(candidate.partId, { include: checked === true })}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{candidate.partName}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    <span className="font-mono">{candidate.partCode}</span>
                    {candidate.supplierName ? ` · ${candidate.supplierName}` : null}
                  </p>
                </div>
                {/* The unit sits under its input rather than beside it: a linear Part reads */}
                {/* "Pieces · 1000 mm each", and next to the box that width shunted the inputs out of line. */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Input
                    aria-label={`Quantity for ${candidate.partCode}`}
                    className="w-24 text-right tabular-nums"
                    disabled={!selection[candidate.partId]?.include}
                    inputMode="decimal"
                    min={0}
                    onChange={(event) => update(candidate.partId, { quantity: event.target.value })}
                    type="number"
                    value={selection[candidate.partId]?.quantity ?? ''}
                  />
                  <span className="text-right text-muted-foreground text-xs">{formatPurchaseUnitLabel(candidate)}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button disabled={mutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={mutation.isPending || hasInvalidQuantity || chosen.length === 0}
            onClick={handleSubmit}
            type="button"
          >
            {mutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Create drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeCreated(codes: readonly string[]): string {
  return codes.length === 1 ? `${codes[0]} created` : `${codes.length} draft Purchase Orders created`;
}
