import type { Part, PurchaseOrderLineView, PurchaseOrderView } from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { usePartOptions } from '@/equipment/hooks/options/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  type PurchaseOrderAmendDialogKind,
  type PurchaseOrderAmendmentFormValues,
  purchaseOrderAmendmentValidator,
} from './types.js';

const DIALOG_COPY = {
  'add-custom-line': {
    description: 'Add a Custom Line to the sent order as a new revision.',
    submitLabel: 'Add custom line',
    title: 'Add custom line',
  },
  'add-line': {
    description: 'Add the line the order should have carried. It goes to the Supplier as a new revision.',
    submitLabel: 'Add line',
    title: 'Add a line',
  },
  'expected-date-change': {
    description: 'Record the delivery date the Supplier now promises. It goes out as a new revision.',
    submitLabel: 'Change expected date',
    title: 'Change expected delivery',
  },
  'quantity-change': {
    description: 'Move the quantity either way. It can never go below what has already been received.',
    submitLabel: 'Change quantity',
    title: 'Change a quantity',
  },
  'custom-quantity': {
    description: 'Change the Custom Line quantity, never below what has already arrived.',
    submitLabel: 'Change quantity',
    title: 'Amend custom quantity',
  },
  'remove-custom-line': {
    description:
      'Remove this Custom Line permanently. Its description remains in amendment history and a new PDF revision is filed.',
    submitLabel: 'Confirm remove line',
    title: 'Remove custom line',
  },
  'substitute-part': {
    description: 'Swap in what the Supplier is sending instead. Only a line nothing has arrived against can change.',
    submitLabel: 'Substitute Part',
    title: 'Substitute a Part',
  },
} as const satisfies Record<PurchaseOrderAmendDialogKind, { description: string; submitLabel: string; title: string }>;

/**
 * The one dialog behind all four amendments (spec §4). They differ only in which fields the buyer
 * fills; every one of them records the same mandatory note, applies to the same sent order, and
 * comes back with a fresh PDF revision to send on.
 */
export function PurchaseOrderAmendDialog({
  kind,
  line,
  onOpenChange,
  purchaseOrder,
}: {
  kind: PurchaseOrderAmendDialogKind;
  /** The line being amended; absent when a new one is being added. */
  line: PurchaseOrderLineView | null;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const copy = DIALOG_COPY[kind];
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const parts = usePartOptions({
    enabled: kind === 'add-line' || kind === 'substitute-part',
    limit: 0,
    sortBy: 'name',
    sortDirection: 'asc',
  });
  // A PO is an order on one Supplier, and a Part appears once — the same rule the draft form applies.
  const eligibleParts = parts.items.filter(
    (part) =>
      part.supplierId === purchaseOrder.supplierId &&
      !purchaseOrder.lines.some((existing) => existing.partId === part.id),
  );
  const onError = (error: unknown) => showMutationError(error, 'Unable to amend this Purchase Order.');
  const quantityMutation = useMutation(trpc.purchaseOrders.amendQuantity.mutationOptions({ onError }));
  const addLineMutation = useMutation(trpc.purchaseOrders.amendAddLine.mutationOptions({ onError }));
  const expectedDateMutation = useMutation(trpc.purchaseOrders.amendExpectedDate.mutationOptions({ onError }));
  const substituteMutation = useMutation(trpc.purchaseOrders.amendSubstitutePart.mutationOptions({ onError }));
  const customQuantityMutation = useMutation(trpc.purchaseOrders.amendCustomLineQuantity.mutationOptions({ onError }));
  const addCustomMutation = useMutation(trpc.purchaseOrders.amendAddCustomLine.mutationOptions({ onError }));
  const removeCustomMutation = useMutation(trpc.purchaseOrders.amendRemoveCustomLine.mutationOptions({ onError }));

  function amend(values: PurchaseOrderAmendmentFormValues) {
    const base = { id: purchaseOrder.id, note: values.note, quantity: values.quantity };

    if (kind === 'expected-date-change') {
      if (!values.expectedDeliveryDate) throw new Error('This amendment needs an expected delivery date');
      return expectedDateMutation.mutateAsync({
        expectedDeliveryDate: values.expectedDeliveryDate,
        id: purchaseOrder.id,
        note: values.note,
      });
    }

    if (kind === 'quantity-change') {
      return quantityMutation.mutateAsync({ ...base, partId: requirePartId(line) });
    }
    if (kind === 'custom-quantity') {
      return customQuantityMutation.mutateAsync({ ...base, lineId: requireLineId(line) });
    }
    if (kind === 'remove-custom-line') {
      return removeCustomMutation.mutateAsync({ id: purchaseOrder.id, lineId: requireLineId(line), note: values.note });
    }
    if (kind === 'add-custom-line') {
      return addCustomMutation.mutateAsync({
        ...base,
        description: values.description,
        supplierCode: values.supplierCode || null,
        unit: values.unit,
        unitPrice: values.unitPrice,
      });
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
      canSubmit={(kind !== 'add-line' && kind !== 'substitute-part') || !parts.isPending}
      defaultValues={{
        description: '',
        expectedDeliveryDate: purchaseOrder.expectedDeliveryDate ?? '',
        newPartId: '',
        note: '',
        quantity: line?.quantity ?? 1,
        supplierCode: '',
        unit: '',
        // A price-blind reader never reaches this dialog, so a stored line always has its price.
        unitPrice: line?.unitPrice ?? 0,
      }}
      description={
        line
          ? `${copy.description} Line: ${line.partCode ? `${line.partCode} · ${line.partName}` : line.description}.`
          : copy.description
      }
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
          {kind === 'expected-date-change' ? (
            <form.AppField name="expectedDeliveryDate">
              {(field) => <field.DatePickerField label="Expected delivery date" />}
            </form.AppField>
          ) : null}
          {kind === 'add-line' || kind === 'substitute-part' ? (
            <form.AppField name="newPartId">
              {(field) => (
                <field.ComboboxField
                  disabled={parts.isPending}
                  emptyMessage="No eligible Parts from this Supplier."
                  label={kind === 'add-line' ? 'Part' : 'Substitute Part'}
                  options={toPartOptions(eligibleParts)}
                  placeholder={parts.isPending ? 'Loading parts...' : 'Search parts'}
                />
              )}
            </form.AppField>
          ) : null}
          {kind === 'add-custom-line' ? (
            <>
              <form.AppField name="description">
                {(field) => <field.TextareaField label="Description" rows={2} />}
              </form.AppField>
              <form.AppField name="unit">{(field) => <field.TextField label="Unit" />}</form.AppField>
              <form.AppField name="supplierCode">
                {(field) => <field.TextField label="Supplier code (optional)" />}
              </form.AppField>
            </>
          ) : null}
          {kind === 'expected-date-change' || kind === 'remove-custom-line' ? null : (
            <form.AppField name="quantity">
              {(field) => (
                <field.NumberField
                  label={
                    kind === 'custom-quantity' && line
                      ? `Quantity (already arrived: ${line.receivedQuantity})`
                      : 'Quantity'
                  }
                  min={0.001}
                  step="0.001"
                />
              )}
            </form.AppField>
          )}
          {kind === 'add-line' || kind === 'substitute-part' || kind === 'add-custom-line' ? (
            <form.AppField name="unitPrice">{(field) => <field.CurrencyField label="Unit price" />}</form.AppField>
          ) : null}
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

function requireLineId(line: PurchaseOrderLineView | null): string {
  if (line?.kind !== 'custom') throw new Error('This amendment needs a Custom Line');
  return line.id;
}

function toPartOptions(parts: readonly Part[]) {
  return parts.map((part) => ({ label: `${part.code} · ${part.name}`, value: part.id }));
}

/**
 * The two Part fields are only ever read on the kinds that render them, so an empty one here means
 * the dialog was assembled wrong rather than that the buyer left something out.
 */
function requirePartId(source: { newPartId: string } | { partId: string | null } | null): string {
  const partId = source && ('partId' in source ? source.partId : source.newPartId);
  if (!partId) throw new Error('This amendment needs a Part');

  return partId;
}
