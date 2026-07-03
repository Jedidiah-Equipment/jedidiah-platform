import type { quotes } from '@pkg/db';
import { formatQuoteCode, QuoteCode } from '@pkg/schema';

import { defineAuditDescriptor } from '../audit/audit-service.js';
import type { QuoteLineItemRow } from './quote-line-items.js';
import type { QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

type QuoteRow = typeof quotes.$inferSelect;
type QuoteLineItemAuditItem = Pick<QuoteLineItemRow, 'name' | 'quantity' | 'unitPrice'>;
type QuoteAuditInput = {
  row: QuoteRow;
  lineItems: readonly QuoteLineItemAuditItem[];
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[];
};

// `code` is the summary label, not an audited field, so it lives in `label`. `selectedAssemblies` is
// folded into one stable JSON field: the Quote Selected Assembly snapshot the audit log diffs against.
export const quoteAuditDescriptor = defineAuditDescriptor<QuoteAuditInput>({
  entityType: 'quote',
  noun: 'quote',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatQuoteAuditLabel,
  entityId: ({ row }) => row.id,
  label: ({ row }) => row.code,
  toRecord: ({ row, lineItems, selectedAssemblies }) => ({
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    notes: row.notes,
    documentNotes: row.documentNotes,
    kind: row.kind,
    plannedDeliveryDate: row.plannedDeliveryDate,
    preferredDeliveryDate: row.preferredDeliveryDate,
    productId: row.productId,
    quotedBasePrice: row.quotedBasePrice,
    quotedCurrencyCode: row.quotedCurrencyCode,
    salesPersonId: row.salesPersonId,
    workTitle: row.workTitle,
    lineItems: JSON.stringify(toQuoteLineItemAuditRecord(lineItems)),
    selectedAssemblies: JSON.stringify(toQuoteSelectedAssemblyAuditRecord(selectedAssemblies)),
    status: row.status,
    validUntil: row.validUntil,
  }),
});

export function formatQuoteAuditLabel(value: unknown): string {
  if (typeof value === 'number') {
    return formatQuoteCode(value);
  }

  const result = QuoteCode.safeParse(value);

  return result.success ? result.data : String(value);
}

export function toQuoteSelectedAssemblyAuditRecord(selectedAssemblies: readonly QuoteSelectedAssemblyRow[]) {
  return selectedAssemblies
    .map((selection) => ({
      productAssemblyId: selection.productAssemblyId,
      quotedName: selection.quotedName,
      quotedPrice: selection.quotedPrice,
    }))
    .toSorted(
      (left, right) =>
        left.quotedName.localeCompare(right.quotedName) ||
        (left.productAssemblyId ?? '').localeCompare(right.productAssemblyId ?? ''),
    );
}

export function toQuoteLineItemAuditRecord(lineItems: readonly QuoteLineItemAuditItem[]) {
  return lineItems
    .map(({ name, quantity, unitPrice }) => ({ name, quantity, unitPrice }))
    .toSorted((left, right) => left.name.localeCompare(right.name) || left.unitPrice - right.unitPrice);
}
