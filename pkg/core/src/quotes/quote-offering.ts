import type { QuoteKind, QuoteOffering } from '@pkg/schema';

import { QuoteOfferingInvariantError } from './quote-errors.js';

/**
 * The single boundary that turns a wire-flat Quote row (`kind` + independently-nullable `productId`
 * and custom-only facts) into the discriminated {@link QuoteOffering}. Apply it wherever a row enters the
 * domain so every downstream branch narrows on `kind` alone instead of re-guarding the paired column.
 * Throws {@link QuoteOfferingInvariantError} for the DB-impossible shapes the `quote_kind_shape`
 * constraint rules out.
 */
export function narrowQuoteOffering(row: {
  kind: QuoteKind;
  hourlyRate: number | null;
  productId: string | null;
  workTitle: string | null;
}): QuoteOffering {
  if (row.kind === 'product') {
    if (row.productId === null) {
      throw new QuoteOfferingInvariantError('Product Quote is missing its Product.');
    }
    if (row.hourlyRate !== null) {
      throw new QuoteOfferingInvariantError('Product Quote cannot have an Hourly Rate.');
    }

    return { kind: 'product', productId: row.productId, workTitle: null };
  }

  if (row.workTitle === null) {
    throw new QuoteOfferingInvariantError('Custom Quote is missing its Work Title.');
  }
  if (row.hourlyRate === null) {
    throw new QuoteOfferingInvariantError('Custom Quote is missing its Hourly Rate.');
  }

  return { hourlyRate: row.hourlyRate, kind: 'custom', productId: null, workTitle: row.workTitle };
}
