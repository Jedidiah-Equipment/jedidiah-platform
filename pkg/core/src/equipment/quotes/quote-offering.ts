import type { QuoteKind, QuoteOffering } from '@pkg/schema/equipment';

import { QuoteError } from './quote-errors.js';

/**
 * The single boundary that turns a wire-flat Quote row (`kind` + independently-nullable `productId`
 * and custom-only facts) into the discriminated {@link QuoteOffering}. Apply it wherever a row enters the
 * domain so every downstream branch narrows on `kind` alone instead of re-guarding the paired columns.
 * Throws `quote.offering_invariant` for the DB-impossible shapes the `quote_kind_shape` and
 * `quote_parts_sale_is_custom` constraints rule out.
 */
export function narrowQuoteOffering(row: {
  isPartsSale: boolean;
  kind: QuoteKind;
  productId: string | null;
  productUnitId: string | null;
  workTitle: string | null;
}): QuoteOffering {
  if (row.kind === 'product') {
    if (row.productId === null) {
      throw new QuoteError('quote.offering_invariant', 'Product Quote is missing its Product.');
    }

    if (row.isPartsSale) {
      throw new QuoteError('quote.offering_invariant', 'Product Quote cannot be a Parts Sale.');
    }

    return { kind: 'product', productId: row.productId, productUnitId: row.productUnitId, workTitle: null };
  }

  if (row.workTitle === null) {
    throw new QuoteError('quote.offering_invariant', 'Custom Quote is missing its Work Title.');
  }

  return {
    isPartsSale: row.isPartsSale,
    kind: 'custom',
    productId: null,
    productUnitId: null,
    workTitle: row.workTitle,
  };
}
