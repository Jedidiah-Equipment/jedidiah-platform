import type { UUID } from '@pkg/schema';

export type QuotePricingResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export const QUOTE_DOCUMENT_VAT_PERCENT = 15;

export function validateDiscount({ discountPercent }: { discountPercent: number }): QuotePricingResult {
  if (discountPercent < 0) {
    return deny('Discount must be zero or greater.');
  }

  if (discountPercent > 100) {
    return deny('Discount must be 100 or less.');
  }

  return { allowed: true, reason: null };
}

export function computeQuoteDiscountAmount({
  discountPercent,
  lineItems = [],
  quotedBasePrice,
  selectedAssemblyPrices = [],
}: {
  discountPercent: number;
  lineItems?: readonly { quantity: number; unitPrice: number }[];
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const lineItemTotal = computeQuoteLineItemsTotal(lineItems);
  const discountableSubtotal = Math.max(0, quotedBasePrice + selectedAssemblyTotal + lineItemTotal);

  return roundCurrency(discountableSubtotal * (discountPercent / 100));
}

export function computeQuoteLineItemsTotal(lineItems: readonly { quantity: number; unitPrice: number }[]): number {
  return lineItems.reduce((sum, item) => sum + computeQuoteLineItemAmount(item), 0);
}

export function computeQuoteLineItemAmount(item: { quantity: number; unitPrice: number }): number {
  return item.quantity * item.unitPrice;
}

export function computeAdditionalDeliveryPrice({
  deliveryIncluded = true,
  deliveryPrice = 0,
}: {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
}): number {
  return deliveryIncluded ? 0 : deliveryPrice;
}

export function computeQuoteVatAmount(subtotal: number, vatPercent: number = QUOTE_DOCUMENT_VAT_PERCENT): number {
  return (subtotal * vatPercent) / 100;
}

export function computeQuoteTotalIncludingVat(
  subtotal: number,
  vatPercent: number = QUOTE_DOCUMENT_VAT_PERCENT,
): number {
  return subtotal + computeQuoteVatAmount(subtotal, vatPercent);
}

export function computeQuoteTotal({
  deliveryIncluded = true,
  deliveryPrice = 0,
  discountPercent,
  lineItems = [],
  quotedBasePrice,
  selectedAssemblyPrices = [],
}: {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discountPercent: number;
  lineItems?: readonly { quantity: number; unitPrice: number }[];
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const lineItemTotal = computeQuoteLineItemsTotal(lineItems);
  const discountAmount = computeQuoteDiscountAmount({
    discountPercent,
    lineItems,
    quotedBasePrice,
    selectedAssemblyPrices,
  });

  return (
    Math.max(0, quotedBasePrice + selectedAssemblyTotal + lineItemTotal - discountAmount) +
    computeAdditionalDeliveryPrice({ deliveryIncluded, deliveryPrice })
  );
}

/** A Quote's stored pricing facts, excluding its selected assemblies. */
export type QuotePricingFacts = {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discountPercent: number;
  lineItems?: readonly { quantity: number; unitPrice: number }[];
  quotedBasePrice: number;
};

/**
 * Quote Pricing: the computed breakdown projected from a Quote's stored pricing facts. Deposit (a
 * payment term) and VAT (a Quote Document concern) are not inputs. `liveSelections` are the
 * selections that contributed to the total, returned as the same objects the caller supplied so
 * each layer keeps its own richer shape.
 */
export type QuotePricing<TSelection> = {
  discountAmount: number;
  lineItemTotal: number;
  liveSelections: readonly TSelection[];
  selectedAssemblyTotal: number;
  total: number;
};

/**
 * Builds Quote Pricing from facts and an already-resolved live selection set. The Quote edit form
 * resolves staleness against the freshly loaded catalog and supplies its live set here directly.
 */
export function priceQuoteFromLiveSelections<TSelection extends { quotedPrice: number }>(
  facts: QuotePricingFacts,
  liveSelections: readonly TSelection[],
): QuotePricing<TSelection> {
  const selectedAssemblyPrices = liveSelections.map((selection) => selection.quotedPrice);
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const lineItemTotal = computeQuoteLineItemsTotal(facts.lineItems ?? []);

  return {
    discountAmount: computeQuoteDiscountAmount({ ...facts, selectedAssemblyPrices }),
    lineItemTotal,
    liveSelections,
    selectedAssemblyTotal,
    total: computeQuoteTotal({ ...facts, selectedAssemblyPrices }),
  };
}

/**
 * Builds Quote Pricing from a persisted Quote row. A selected Optional Assembly is live when its
 * catalog reference survives: `on delete set null` makes a null `productAssemblyId` the complete
 * stale set for persisted selections, so no product catalog is needed to total a stored Quote.
 */
export function priceQuote<TSelection extends { productAssemblyId: UUID | null; quotedPrice: number }>(
  quote: QuotePricingFacts & { selectedAssemblies: readonly TSelection[] },
): QuotePricing<TSelection> {
  const liveSelections = quote.selectedAssemblies.filter((selection) => selection.productAssemblyId !== null);

  return priceQuoteFromLiveSelections(quote, liveSelections);
}

function deny(reason: string): QuotePricingResult {
  return { allowed: false, reason };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
