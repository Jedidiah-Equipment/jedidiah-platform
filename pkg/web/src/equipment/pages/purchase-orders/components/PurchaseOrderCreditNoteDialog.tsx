import { formatDate, formatNumber } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { type PurchaseOrderReturnRow, STOCK_RETURN_TO_SUPPLIER_REASON_LABELS } from '@pkg/schema/equipment';
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
import { Field, FieldLabel } from '@/components/ui/field.js';
import { DocumentFileField } from '@/equipment/components/documents/DocumentFileField.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { uploadCreditNote } from '@/equipment/utils/document.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

/**
 * Files a supplier credit and ticks the returns it answers.
 *
 * The tick list is the point: a credit note settling nothing would leave the returns it paid for on
 * the awaiting-credit list forever, so at least one return has to be named (spec §4). Only returns
 * nothing has credited yet are offered — the supplier credits each one once.
 */
export function PurchaseOrderCreditNoteDialog({
  onOpenChange,
  purchaseOrderId,
  returns,
}: {
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: UUID;
  returns: readonly PurchaseOrderReturnRow[];
}) {
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [returnsError, setReturnsError] = useState('');
  const [settledIds, setSettledIds] = useState<readonly UUID[]>([]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choose a credit note to upload.');

      return uploadCreditNote({ file, purchaseOrderId, stockMovementIds: settledIds });
    },
    onError: (error) => showMutationError(error, 'Unable to upload this credit note.'),
    onSuccess: async () => {
      await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
      onOpenChange(false);
      toast.success('Credit note filed');
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a credit note</DialogTitle>
          <DialogDescription>Attach the Supplier's credit note and tick the returns it settles.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <DocumentFileField
            error={error}
            file={file}
            id="credit-note-file"
            label="Credit note PDF"
            onChange={setFile}
            onError={setError}
            ownerType="purchase_order"
            pending={mutation.isPending}
          />
          <Field>
            <FieldLabel>Returns this credit note settles</FieldLabel>
            <div className="grid gap-2">
              {returns.map((row) => (
                <div className="flex items-start gap-2 text-sm" key={row.id}>
                  <Checkbox
                    checked={settledIds.includes(row.id)}
                    disabled={mutation.isPending}
                    aria-describedby={returnsError ? 'credit-note-returns-error' : undefined}
                    id={`credit-note-return-${row.id}`}
                    onCheckedChange={(checked) => {
                      setReturnsError('');
                      setSettledIds((current) =>
                        checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                      );
                    }}
                  />
                  <label htmlFor={`credit-note-return-${row.id}`}>
                    <span className="font-medium">{row.partCode}</span> · {formatNumber(row.quantity)} ·{' '}
                    {STOCK_RETURN_TO_SUPPLIER_REASON_LABELS[row.reason]}
                    <span className="text-muted-foreground"> · {formatDate(row.createdAt)}</span>
                  </label>
                </div>
              ))}
            </div>
            {returnsError ? (
              <p id="credit-note-returns-error" role="alert" className="text-sm text-destructive">
                {returnsError}
              </p>
            ) : null}
          </Field>
        </div>
        <DialogFooter>
          <DialogClose render={<Button disabled={mutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              if (mutation.isPending) return;
              setError(file ? '' : 'Choose a credit note to upload.');
              setReturnsError(settledIds.length ? '' : 'Choose at least one return this credit note settles.');
              if (file && settledIds.length) mutation.mutate();
            }}
            type="button"
          >
            {mutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            File credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
