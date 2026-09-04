import { pricePersistedQuote } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';

/** The stored pricing facts a report needs off a Quote row, and nothing else. */
export type ReportQuotePricingRow = {
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountPercent: number;
  kind: 'custom' | 'product';
  quotedBasePrice: number;
};

export type ReportQuotePricingSelection = { productAssemblyId: UUID | null; quotedPrice: number };
export type ReportQuotePricingWorkItem = {
  hourlyRate: number;
  hours: number;
  parts: readonly { quantity: number; unitPrice: number }[];
};

/**
 * Quote Pricing for a Quote loaded as report rows, where the pricing facts arrive as plain columns
 * and its associations as maps keyed by Quote. Shared by every aggregate that prices a Quote it did
 * not load through the Quote read service, so a Quote is worth the same on the dashboard as on the
 * sales report — `kind` is what pins whether Work Items may contribute at all.
 */
export function priceReportQuote({
  row,
  selectedAssemblies,
  workItems,
}: {
  row: ReportQuotePricingRow;
  selectedAssemblies: readonly ReportQuotePricingSelection[];
  workItems: readonly ReportQuotePricingWorkItem[];
}) {
  const commonFacts = {
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    quotedBasePrice: row.quotedBasePrice,
    selectedAssemblies,
  };

  if (row.kind === 'product') return pricePersistedQuote({ ...commonFacts, kind: 'product' });

  return pricePersistedQuote({ ...commonFacts, kind: 'custom', workItems });
}
