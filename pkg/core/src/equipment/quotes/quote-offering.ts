import { quoteKindLabels } from '@pkg/domain';
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
  productId: string | null;
  productUnitId: string | null;
  workTitle: string | null;
}): QuoteOffering {
  if (row.kind === 'product') {
    if (row.productId === null) {
      throw new QuoteOfferingInvariantError('Product Quote is missing its Product.');
    }

    return { kind: 'product', productId: row.productId, productUnitId: row.productUnitId, workTitle: null };
  }

  if (row.workTitle === null) {
    throw new QuoteOfferingInvariantError(`${quoteKindLabels.custom} Quote is missing its Work Title.`);
  }

  return { kind: 'custom', productId: null, productUnitId: null, workTitle: row.workTitle };
}
