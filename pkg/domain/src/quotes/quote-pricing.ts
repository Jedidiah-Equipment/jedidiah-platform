import type { Assembly, UUID } from '@pkg/schema';

import { resolveEffectiveBom } from './effective-bom.js';

export type QuotePricingResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export const VAT_PERCENT = 15;

export function validateDiscount({ discountPercent }: { discountPercent: number }): QuotePricingResult {
  if (discountPercent < 0) {
    return deny('Discount must be zero or greater.');
  }

  if (discountPercent > 100) {
    return deny('Discount must be 100 or less.');
  }

  return { allowed: true, reason: null };
}

function computeQuoteDiscountAmount({
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

function computeQuoteLineItemsTotal(lineItems: readonly { quantity: number; unitPrice: number }[]): number {
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

export function computeQuoteVatAmount(subtotal: number, vatPercent: number = VAT_PERCENT): number {
  return roundCurrency((subtotal * vatPercent) / 100);
}

function computeQuoteTotal({
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
 * Quote Pricing: the computed breakdown projected from a Quote's stored pricing facts.
 * `subtotal` is ex-VAT; `total` is the VAT-inclusive price shown to customers. Deposit (a
 * payment term) is not an input. `liveSelections` are the selections that contributed to the
 * total, returned as the same objects the caller supplied so each layer keeps its own richer
 * shape.
 */
export type QuotePricing<TSelection> = {
  discountAmount: number;
  lineItemTotal: number;
  liveSelections: readonly TSelection[];
  selectedAssemblyTotal: number;
  subtotal: number;
  total: number;
  vatAmount: number;
  vatPercent: number;
};

function priceQuoteFromLiveSelections<TSelection extends { quotedPrice: number }>(
  facts: QuotePricingFacts,
  liveSelections: readonly TSelection[],
): QuotePricing<TSelection> {
  const selectedAssemblyPrices = liveSelections.map((selection) => selection.quotedPrice);
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const lineItemTotal = computeQuoteLineItemsTotal(facts.lineItems ?? []);
  const subtotal = computeQuoteTotal({ ...facts, selectedAssemblyPrices });
  const vatAmount = computeQuoteVatAmount(subtotal);

  return {
    discountAmount: computeQuoteDiscountAmount({ ...facts, selectedAssemblyPrices }),
    lineItemTotal,
    liveSelections,
    selectedAssemblyTotal,
    subtotal,
    total: subtotal + vatAmount,
    vatAmount,
    vatPercent: VAT_PERCENT,
  };
}

/**
 * Builds Quote Pricing from a persisted Quote row. A selected Optional Assembly is live when its
 * catalog reference survives: Assembly kind is immutable and deletion is `on delete set null`, so a
 * null `productAssemblyId` is the complete stale set for persisted selections and no product
 * catalog is needed to total a stored Quote.
 */
export function priceQuote<TSelection extends { productAssemblyId: UUID | null; quotedPrice: number }>(
  quote: QuotePricingFacts & { selectedAssemblies: readonly TSelection[] },
): QuotePricing<TSelection> {
  const liveSelections = quote.selectedAssemblies.filter((selection) => selection.productAssemblyId !== null);

  return priceQuoteFromLiveSelections(quote, liveSelections);
}

/**
 * Builds Quote Pricing by resolving selections against a loaded product catalog: selections that do
 * not resolve to a live Optional Assembly are dropped from the total and returned as
 * `staleSelections`, and `liveSelections` follows the catalog's display order. This is the seam for
 * catalog-loaded surfaces — the Quote edit form (whose in-flight selections can go stale mid-edit)
 * and the Quote Document. On persisted selections it agrees with `priceQuote`.
 */
export function priceQuoteWithCatalog<TSelection extends { productAssemblyId: UUID | null; quotedPrice: number }>(
  quote: QuotePricingFacts & { selectedAssemblies: readonly TSelection[] },
  catalogAssemblies: readonly Assembly[],
): QuotePricing<TSelection> & { staleSelections: readonly TSelection[] } {
  const { selectedOptionalAssemblies, staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: quote.selectedAssemblies,
  });
  const liveSelections = selectedOptionalAssemblies.map(({ selection }) => selection);

  return { ...priceQuoteFromLiveSelections(quote, liveSelections), staleSelections };
}

function deny(reason: string): QuotePricingResult {
  return { allowed: false, reason };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
