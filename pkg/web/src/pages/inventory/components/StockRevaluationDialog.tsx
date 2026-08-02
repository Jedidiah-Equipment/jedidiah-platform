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
import { parseRevaluationForm, type StockPartOption } from './types.js';

export function StockRevaluationDialog({
  onOpenChange,
  open,
  parts,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [partId, setPartId] = useState(parts[0]?.partId ?? '');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const selectedPart = parts.find((part) => part.partId === partId) ?? parts[0];
  const selectedPartId = selectedPart?.partId ?? '';
  const mutation = useMutation(
    trpc.inventory.postRevaluation.mutationOptions({
      onSuccess: async () => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Part revalued');
      },
      onError: (error) => showMutationError(error, 'Unable to revalue the Part.'),
    }),
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseRevaluationForm({ note, partId: selectedPartId, unitCost });

    if (!parsed.success) {
      setValidationMessage(parsed.error.issues[0]?.message ?? 'Check the revaluation details.');
      return;
    }

    setValidationMessage(null);
    mutation.mutate(parsed.data);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revalue Part</DialogTitle>
          <DialogDescription>Set the Part's moving average with a zero-quantity ledger row.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <StockPartSelect onChange={setPartId} parts={parts} value={selectedPartId} />
          <Field>
            <FieldLabel htmlFor="inventory-revaluation-cost">
              {selectedPart?.unitOfMeasure === 'mm' ? 'New cost per mm' : 'New unit cost'}
            </FieldLabel>
            <Input
              id="inventory-revaluation-cost"
              min="0"
              onChange={(event) => setUnitCost(event.target.value)}
              required
              step={selectedPart?.unitOfMeasure === 'mm' ? '0.000001' : '0.01'}
              type="number"
              value={unitCost}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="inventory-revaluation-note">Note (optional)</FieldLabel>
            <Textarea
              id="inventory-revaluation-note"
              onChange={(event) => setNote(event.target.value)}
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
              Post revaluation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
