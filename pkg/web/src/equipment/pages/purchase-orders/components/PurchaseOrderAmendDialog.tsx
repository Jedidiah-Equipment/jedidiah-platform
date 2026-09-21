import { formatPurchaseOrderLineLabel } from '@pkg/domain/equipment';
import {
  findPurchaseOrderPartLine,
  type Part,
  type PurchaseOrderLineView,
  type PurchaseOrderPartLineView,
  type PurchaseOrderView,
} from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { usePartOptions } from '@/equipment/hooks/options/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  PURCHASE_ORDER_AMENDMENT_FIELDS,
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
    description: 'Move the quantity either way. It can never go below what has already arrived.',
    submitLabel: 'Change quantity',
    title: 'Change a quantity',
  },
  'remove-line': {
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
 * The one dialog behind every amendment (spec §4). They differ only in which fields the buyer fills
 * (`PURCHASE_ORDER_AMENDMENT_FIELDS`); every one of them records the same mandatory note, applies to
 * the same sent order, and comes back with a fresh PDF revision to send on.
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
  const fields = PURCHASE_ORDER_AMENDMENT_FIELDS[kind];
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const parts = usePartOptions({
    enabled: fields.includes('newPartId'),
    limit: 0,
    sortBy: 'name',
    sortDirection: 'asc',
  });
  // A PO is an order on one Supplier, and a Part appears once — the same rule the draft form applies.
  const eligibleParts = parts.items.filter(
    (part) => part.supplierId === purchaseOrder.supplierId && !findPurchaseOrderPartLine(purchaseOrder.lines, part.id),
  );
  const onError = (error: unknown) => showMutationError(error, 'Unable to amend this Purchase Order.');
  const quantityMutation = useMutation(trpc.purchaseOrders.amendQuantity.mutationOptions({ onError }));
  const addLineMutation = useMutation(trpc.purchaseOrders.amendAddLine.mutationOptions({ onError }));
  const addCustomLineMutation = useMutation(trpc.purchaseOrders.amendAddCustomLine.mutationOptions({ onError }));
  const removeLineMutation = useMutation(trpc.purchaseOrders.amendRemoveCustomLine.mutationOptions({ onError }));
  const expectedDateMutation = useMutation(trpc.purchaseOrders.amendExpectedDate.mutationOptions({ onError }));
  const substituteMutation = useMutation(trpc.purchaseOrders.amendSubstitutePart.mutationOptions({ onError }));

  function amend(values: PurchaseOrderAmendmentFormValues) {
    const base = { id: purchaseOrder.id, note: values.note };
    const newLine = { ...base, quantity: values.quantity, unitPrice: values.unitPrice };

    switch (kind) {
      case 'expected-date-change':
        return expectedDateMutation.mutateAsync({ ...base, expectedDeliveryDate: keyed(values.expectedDeliveryDate) });
      case 'quantity-change':
        return quantityMutation.mutateAsync({ ...base, lineId: amended(line).id, quantity: values.quantity });
      case 'remove-line':
        return removeLineMutation.mutateAsync({ ...base, lineId: amended(line).id });
      case 'add-line':
        return addLineMutation.mutateAsync({ ...newLine, partId: keyed(values.newPartId) });
      case 'add-custom-line':
        return addCustomLineMutation.mutateAsync({
          ...newLine,
          description: values.description,
          supplierCode: values.supplierCode || null,
          unit: values.unit,
        });
      case 'substitute-part':
        return substituteMutation.mutateAsync({
          ...newLine,
          newPartId: keyed(values.newPartId),
          partId: amendedPartLine(line).partId,
        });
    }
  }

  return (
    <CreateEntityDialog<PurchaseOrderAmendmentFormValues, unknown>
      canSubmit={!fields.includes('newPartId') || !parts.isPending}
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
      description={line ? `${copy.description} Line: ${formatPurchaseOrderLineLabel(line)}.` : copy.description}
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
          {fields.includes('expectedDeliveryDate') ? (
            <form.AppField name="expectedDeliveryDate">
              {(field) => <field.DatePickerField label="Expected delivery date" />}
            </form.AppField>
          ) : null}
          {fields.includes('newPartId') ? (
            <form.AppField name="newPartId">
              {(field) => (
                <field.ComboboxField
                  disabled={parts.isPending}
                  emptyMessage="No eligible Parts from this Supplier."
                  label={kind === 'substitute-part' ? 'Substitute Part' : 'Part'}
                  options={toPartOptions(eligibleParts)}
                  placeholder={parts.isPending ? 'Loading parts...' : 'Search parts'}
                />
              )}
            </form.AppField>
          ) : null}
          {fields.includes('description') ? (
            <form.AppField name="description">
              {(field) => <field.TextareaField label="Description" rows={2} />}
            </form.AppField>
          ) : null}
          {fields.includes('unit') ? (
            <form.AppField name="unit">{(field) => <field.TextField label="Unit" />}</form.AppField>
          ) : null}
          {fields.includes('supplierCode') ? (
            <form.AppField name="supplierCode">
              {(field) => <field.TextField label="Supplier code (optional)" />}
            </form.AppField>
          ) : null}
          {fields.includes('quantity') ? (
            <form.AppField name="quantity">
              {(field) => (
                <field.NumberField
                  label={
                    kind === 'quantity-change' && line
                      ? `Quantity (already arrived: ${line.receivedQuantity})`
                      : 'Quantity'
                  }
                  min={0.001}
                  step="0.001"
                />
              )}
            </form.AppField>
          ) : null}
          {fields.includes('unitPrice') ? (
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

function toPartOptions(parts: readonly Part[]) {
  return parts.map((part) => ({ label: `${part.code} · ${part.name}`, value: part.id }));
}

/**
 * The validator has already insisted on every field a kind asks for, and the page only opens a line's
 * amendment on that line — so a miss here means the dialog was assembled wrong, not that the buyer
 * left something out.
 */
function keyed<TValue extends string>(value: TValue | ''): TValue {
  if (value === '') throw new Error('This amendment is missing a field its kind asks for');

  return value;
}

function amended(line: PurchaseOrderLineView | null): PurchaseOrderLineView {
  if (!line) throw new Error('This amendment needs a line');

  return line;
}

function amendedPartLine(line: PurchaseOrderLineView | null): PurchaseOrderPartLineView {
  if (line?.kind !== 'part') throw new Error('This amendment needs a Part Line');

  return line;
}
