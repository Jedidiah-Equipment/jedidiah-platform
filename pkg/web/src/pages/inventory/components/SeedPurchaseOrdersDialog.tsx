import type { PartUnitOfMeasure } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
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

/** One ticked Part on its way to a draft line. Supplier-blind: the split is the server's to make. */
export type SeedPurchaseOrderCandidate = {
  partCode: string;
  partId: string;
  partName: string;
  suggestedQuantity: number;
  supplierName: string | null;
  unitOfMeasure: PartUnitOfMeasure;
};

/**
 * The last look before a selection becomes drafts: what is being ordered, from whom, and how much.
 *
 * Quantities prefill from the suggestion and stay editable — the number is advice, and the buyer
 * knows things the shortfall does not (a pack size, a delivery already promised by phone). Prices
 * are absent on purpose: the buy list is quantity-only under the cost gate, so the draft is where
 * they get keyed.
 */
export function SeedPurchaseOrdersDialog({
  candidates,
  jobId = null,
  onOpenChange,
  onSeeded,
  open,
}: {
  candidates: readonly SeedPurchaseOrderCandidate[];
  jobId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSeeded?: () => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const mutation = useMutation(trpc.purchaseOrders.seedDrafts.mutationOptions());
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setQuantities(Object.fromEntries(candidates.map((row) => [row.partId, String(row.suggestedQuantity)])));
    }
  }, [candidates, open]);

  const lines = candidates.map((candidate) => ({
    candidate,
    quantity: Number.parseFloat(quantities[candidate.partId] ?? ''),
  }));
  const hasInvalidQuantity = lines.some(({ quantity }) => !Number.isFinite(quantity) || quantity <= 0);

  const handleSubmit = async () => {
    try {
      const result = await mutation.mutateAsync({
        jobId,
        lines: lines.map(({ candidate, quantity }) => ({ partId: candidate.partId, quantity })),
      });
      await Promise.all([invalidateInventory(), invalidatePurchaseOrders()]);
      toast.success(describeSeeded(result.purchaseOrders.map((purchaseOrder) => purchaseOrder.code)));
      onSeeded?.();
      onOpenChange(false);
    } catch (error) {
      showMutationError(error, 'Unable to create the draft Purchase Orders.');
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create draft Purchase Orders</DialogTitle>
          <DialogDescription>
            The selection splits into one draft per Supplier. Add prices on the drafts before sending them.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="grid gap-3">
            {lines.map(({ candidate }) => (
              <div className="flex items-center justify-between gap-3" key={candidate.partId}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{candidate.partName}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    <span className="font-mono">{candidate.partCode}</span>
                    {candidate.supplierName ? ` · ${candidate.supplierName}` : null}
                  </p>
                </div>
                <Input
                  aria-label={`Quantity for ${candidate.partCode}`}
                  className="w-28 shrink-0 text-right tabular-nums"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [candidate.partId]: event.target.value }))
                  }
                  type="number"
                  value={quantities[candidate.partId] ?? ''}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button disabled={mutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={mutation.isPending || hasInvalidQuantity || lines.length === 0}
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

function describeSeeded(codes: readonly string[]): string {
  return codes.length === 1 ? `${codes[0]} created` : `${codes.length} draft Purchase Orders created`;
}
