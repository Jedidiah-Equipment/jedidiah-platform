import type { Part, PurchaseOrderAmendmentKind, PurchaseOrderLineView, PurchaseOrderView } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { usePartOptions } from '@/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { type PurchaseOrderAmendmentFormValues, purchaseOrderAmendmentValidator } from './types.js';

const DIALOG_COPY = {
  'add-line': {
    description: 'Add the line the order should have carried. It goes to the Supplier as a new revision.',
    submitLabel: 'Add line',
    title: 'Add a line',
  },
  'quantity-change': {
    description: 'Move the quantity either way. It can never go below what has already been received.',
    submitLabel: 'Change quantity',
    title: 'Change a quantity',
  },
  'substitute-part': {
    description: 'Swap in what the Supplier is sending instead. Only a line nothing has arrived against can change.',
    submitLabel: 'Substitute Part',
    title: 'Substitute a Part',
  },
} as const satisfies Record<PurchaseOrderAmendmentKind, { description: string; submitLabel: string; title: string }>;

/**
 * The one dialog behind all three amendments (spec §4). They differ only in which fields the buyer
 * fills; every one of them records the same mandatory note, applies to the same sent order, and
 * comes back with a fresh PDF revision to send on.
 */
export function PurchaseOrderAmendDialog({
  kind,
  line,
  onOpenChange,
  purchaseOrder,
}: {
  kind: PurchaseOrderAmendmentKind;
  /** The line being amended; absent when a new one is being added. */
  line: PurchaseOrderLineView | null;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const copy = DIALOG_COPY[kind];
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const parts = usePartOptions({ limit: 0, sortBy: 'name', sortDirection: 'asc' });
  // A PO is an order on one Supplier, and a Part appears once — the same rule the draft form applies.
  const eligibleParts = parts.items.filter(
    (part) =>
      part.supplierId === purchaseOrder.supplierId &&
      !purchaseOrder.lines.some((existing) => existing.partId === part.id),
  );
  const onError = (error: unknown) => showMutationError(error, 'Unable to amend this Purchase Order.');
  const quantityMutation = useMutation(trpc.purchaseOrders.amendQuantity.mutationOptions({ onError }));
  const addLineMutation = useMutation(trpc.purchaseOrders.amendAddLine.mutationOptions({ onError }));
  const substituteMutation = useMutation(trpc.purchaseOrders.amendSubstitutePart.mutationOptions({ onError }));

  function amend(values: PurchaseOrderAmendmentFormValues) {
    const base = { id: purchaseOrder.id, note: values.note, quantity: values.quantity };

    if (kind === 'quantity-change') {
      return quantityMutation.mutateAsync({ ...base, partId: requirePartId(line) });
    }

    if (kind === 'add-line') {
      return addLineMutation.mutateAsync({ ...base, partId: requirePartId(values), unitPrice: values.unitPrice });
    }

    return substituteMutation.mutateAsync({
      ...base,
      newPartId: requirePartId(values),
      partId: requirePartId(line),
      unitPrice: values.unitPrice,
    });
  }

  return (
    <CreateEntityDialog<PurchaseOrderAmendmentFormValues, unknown>
      canSubmit={kind === 'quantity-change' || !parts.isPending}
      defaultValues={{
        newPartId: '',
        note: '',
        quantity: line?.quantity ?? 1,
        // A price-blind reader never reaches this dialog, so a stored line always has its price.
        unitPrice: line?.unitPrice ?? 0,
      }}
      description={line ? `${copy.description} Line: ${line.partCode} · ${line.partName}.` : copy.description}
      onCreate={amend}
      onCreated={async () => {
        await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
        onOpenChange(false);
        toast.success('Purchase Order amended');
      }}
      onOpenChange={onOpenChange}
      open
      submitLabel={copy.submitLabel}
      title={copy.title}
      validator={purchaseOrderAmendmentValidator(kind)}
    >
      {(form) => (
        <>
          {kind === 'quantity-change' ? null : (
            <form.AppField name="newPartId">
              {(field) => (
                <field.ComboboxField
                  disabled={parts.isPending}
                  emptyMessage="No eligible Parts from this Supplier."
                  label={kind === 'add-line' ? 'Part' : 'Substitute Part'}
                  options={toPartOptions(eligibleParts)}
                  placeholder={parts.isPending ? 'Loading Parts...' : 'Search Parts'}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Quantity" min={0.001} step="0.001" />}
          </form.AppField>
          {kind === 'quantity-change' ? null : (
            <form.AppField name="unitPrice">{(field) => <field.CurrencyField label="Unit price" />}</form.AppField>
          )}
          <form.AppField name="note">
            {(field) => (
              <field.TextareaField
                label="Note"
                placeholder="Who agreed this, and why — the call is the record."
                rows={3}
              />
            )}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

function toPartOptions(parts: readonly Part[]) {
  return parts.map((part) => ({ label: `${part.code} · ${part.name}`, value: part.id }));
}

/**
 * The two Part fields are only ever read on the kinds that render them, so an empty one here means
 * the dialog was assembled wrong rather than that the buyer left something out.
 */
function requirePartId(source: { newPartId: string } | { partId: string } | null): string {
  const partId = source && ('partId' in source ? source.partId : source.newPartId);
  if (!partId) throw new Error('This amendment needs a Part');

  return partId;
}
