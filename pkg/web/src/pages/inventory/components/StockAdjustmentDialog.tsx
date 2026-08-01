import { STOCK_ADJUSTMENT_REASON_LABELS, type StockAdjustmentReason } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
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
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockPartSelect } from './StockPartSelect.js';
import { parseAdjustmentForm, type StockPartOption } from './types.js';

export function StockAdjustmentDialog({
  canReadCost,
  onOpenChange,
  open,
  parts,
}: {
  canReadCost: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [partId, setPartId] = useState(parts[0]?.partId ?? '');
  const [delta, setDelta] = useState('');
  const [lengthMm, setLengthMm] = useState('');
  const [reason, setReason] = useState<StockAdjustmentReason>('opening-balance');
  const [note, setNote] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const selectedPart = parts.find((part) => part.partId === partId) ?? parts[0];
  const mutation = useMutation(
    trpc.inventory.postAdjustment.mutationOptions({
      onSuccess: async () => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Stock adjustment posted');
      },
      onError: (error) => showMutationError(error, 'Unable to post stock adjustment.'),
    }),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPart) {
      setValidationMessage('Select a Part.');
      return;
    }

    const parsed = parseAdjustmentForm({
      canReadCost,
      part: selectedPart,
      values: { delta, lengthMm, note, partId, reason, unitCost },
    });

    if (!parsed.success) {
      setValidationMessage(parsed.error.issues[0]?.message ?? 'Check the adjustment details.');
      return;
    }

    setValidationMessage(null);
    mutation.mutate(parsed.data);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post stock adjustment</DialogTitle>
          <DialogDescription>Append a signed quantity change to the Part ledger.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <StockPartSelect onChange={setPartId} parts={parts} value={selectedPart?.partId ?? partId} />
          <Field>
            <FieldLabel htmlFor="inventory-adjustment-delta">Signed quantity delta</FieldLabel>
            <Input
              id="inventory-adjustment-delta"
              inputMode="decimal"
              onChange={(event) => setDelta(event.target.value)}
              placeholder="10 or -2"
              required
              step="0.001"
              type="number"
              value={delta}
            />
          </Field>
          {selectedPart?.unitOfMeasure === 'mm' ? (
            <Field>
              <FieldLabel htmlFor="inventory-adjustment-length">Length (mm)</FieldLabel>
              <Input
                id="inventory-adjustment-length"
                min="1"
                onChange={(event) => setLengthMm(event.target.value)}
                required
                step="1"
                type="number"
                value={lengthMm}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="inventory-adjustment-reason">Reason</FieldLabel>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              id="inventory-adjustment-reason"
              onChange={(event) => setReason(event.target.value as StockAdjustmentReason)}
              value={reason}
            >
              {Object.entries(STOCK_ADJUSTMENT_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {canReadCost && reason === 'opening-balance' ? (
            <Field>
              <FieldLabel htmlFor="inventory-adjustment-cost">Unit cost (optional)</FieldLabel>
              <Input
                id="inventory-adjustment-cost"
                min="0"
                onChange={(event) => setUnitCost(event.target.value)}
                step="0.01"
                type="number"
                value={unitCost}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="inventory-adjustment-note">
              Note {reason === 'opening-balance' ? '(optional)' : ''}
            </FieldLabel>
            <Textarea
              id="inventory-adjustment-note"
              onChange={(event) => setNote(event.target.value)}
              required={reason !== 'opening-balance'}
              rows={3}
              value={note}
            />
          </Field>
          {validationMessage ? <p className="text-destructive text-sm">{validationMessage}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button disabled={mutation.isPending} type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={mutation.isPending} type="submit">
              Post adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
