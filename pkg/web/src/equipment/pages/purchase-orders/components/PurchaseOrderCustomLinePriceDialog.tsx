import { formatPurchaseOrderLineLabel } from '@pkg/domain/equipment';
import { type PurchaseOrderCustomLineView, PurchaseOrderUnitPrice } from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const PriceFormValues = z.object({ unitPrice: PurchaseOrderUnitPrice });
type PriceFormValues = z.infer<typeof PriceFormValues>;

/** Records a sent Custom Line's price from its delivery note or invoice. Nothing goes to the Supplier. */
export function PurchaseOrderCustomLinePriceDialog({
  line,
  onOpenChange,
  purchaseOrderId,
}: {
  line: PurchaseOrderCustomLineView;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string;
}) {
  const trpc = useTRPC();
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const priceMutation = useMutation(
    trpc.purchaseOrders.priceCustomLine.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to set this price.'),
    }),
  );

  return (
    <CreateEntityDialog<PriceFormValues, unknown>
      defaultValues={{ unitPrice: line.unitPrice ?? 0 }}
      description={`Enter the price from the delivery note or invoice. Line: ${formatPurchaseOrderLineLabel(line)}.`}
      onCreate={(values) =>
        priceMutation.mutateAsync({ id: purchaseOrderId, lineId: line.id, unitPrice: values.unitPrice })
      }
      onCreated={async () => {
        await invalidatePurchaseOrders();
        onOpenChange(false);
        toast.success('Price saved');
      }}
      onOpenChange={onOpenChange}
      open
      submitLabel="Save price"
      title="Set price"
      validator={PriceFormValues}
    >
      {(form) => (
        <form.AppField name="unitPrice">{(field) => <field.CurrencyField label="Unit price" />}</form.AppField>
      )}
    </CreateEntityDialog>
  );
}
