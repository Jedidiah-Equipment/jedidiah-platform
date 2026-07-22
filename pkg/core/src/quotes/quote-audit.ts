import type { quotes } from '@pkg/db';
import { formatQuoteCode, QuoteCode } from '@pkg/schema';

import { defineAuditDescriptor } from '../audit/audit-service.js';
import type { QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

type QuoteRow = typeof quotes.$inferSelect;
type QuoteWorkItemAuditItem = {
  hours: number;
  name: string;
  parts: readonly { name: string; quantity: number; unitPrice: number }[];
};
type QuoteAuditInput = {
  row: QuoteRow;
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[];
  workItems: readonly QuoteWorkItemAuditItem[];
};

// `code` is the summary label, not an audited field, so it lives in `label`. Collections audit
// element-wise (`toCollections`) so only the changed elements are recorded.
export const quoteAuditDescriptor = defineAuditDescriptor<QuoteAuditInput>({
  entityType: 'quote',
  noun: 'quote',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatQuoteAuditLabel,
  entityId: ({ row }) => row.id,
  label: ({ row }) => row.code,
  toRecord: ({ row }) => ({
    cancellationReason: row.cancellationReason,
    customerId: row.customerId,
    depositPercent: row.depositPercent,
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    hourlyRate: row.hourlyRate,
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
    status: row.status,
    validUntil: row.validUntil,
  }),
  toCollections: ({ selectedAssemblies, workItems }) => ({
    selectedAssembly: toQuoteSelectedAssemblyAuditRecord(selectedAssemblies).map((selection) => ({
      key: selection.productAssemblyId ?? selection.quotedName,
      label: selection.quotedName,
      value: selection,
    })),
    workItem: workItems.map((workItem) => ({
      key: workItem.name,
      label: workItem.name,
      value: {
        hours: workItem.hours,
        name: workItem.name,
        parts: workItem.parts.map(({ name, quantity, unitPrice }) => ({ name, quantity, unitPrice })),
      },
    })),
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
