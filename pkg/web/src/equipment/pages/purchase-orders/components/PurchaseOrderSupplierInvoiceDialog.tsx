import { getDocumentPolicy } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
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
import { uploadSupplierInvoice, validateSelectedFile } from '@/equipment/utils/document.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';

const SUPPLIER_INVOICE_ACCEPT = getDocumentPolicy('purchase_order').allowedContentTypes.join(',');

/**
 * Files the Supplier's bill against the order and reads it on the way in.
 *
 * The read happens inside the upload request, so the button stays busy while it runs — and an
 * invoice the model cannot make sense of still uploads, arriving in the list as one nobody could
 * read (spec §5). Nothing about this dialog is a gate. The copy names the AI and the wait it brings,
 * because a desk that does not expect either reads a slow upload as a broken one.
 */
export function PurchaseOrderSupplierInvoiceDialog({
  onOpenChange,
  purchaseOrderId,
}: {
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: UUID;
}) {
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choose a Supplier invoice to upload.');

      return uploadSupplierInvoice({ file, purchaseOrderId });
    },
    onError: (error) => showMutationError(error, 'Unable to upload this Supplier invoice.'),
    onSuccess: async () => {
      await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
      onOpenChange(false);
      toast.success('Supplier invoice filed');
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File a Supplier invoice</DialogTitle>
          <DialogDescription>
            The invoice is read by AI and cross-checked against this order's lines. Every difference is a flag to judge,
            never a change to the order.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="supplier-invoice-file">Invoice PDF</FieldLabel>
          <Input
            accept={SUPPLIER_INVOICE_ACCEPT}
            id="supplier-invoice-file"
            onChange={(event) => setFile(validateSelectedFile(event.target.files?.[0] ?? null, 'purchase_order'))}
            type="file"
          />
        </Field>
        {/* The read runs inside the upload, so the wait is the AI's. Saying so before the click is what
            stops it reading as a stuck upload. */}
        <p className="text-muted-foreground text-sm">
          The PDF is sent to our AI provider to be transcribed, so filing takes longer than a plain upload — keep this
          open until it finishes. An invoice the AI cannot read is still filed.
        </p>
        <DialogFooter>
          <DialogClose render={<Button disabled={mutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={mutation.isPending || !file}
            onClick={() => void mutation.mutateAsync().catch(() => undefined)}
            type="button"
          >
            {mutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            {mutation.isPending ? 'Reading invoice...' : 'File invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
