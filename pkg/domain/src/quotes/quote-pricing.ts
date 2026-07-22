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
export const DEFAULT_CUSTOM_HOURLY_RATE = 850;

type WorkItemPartPricingInput = { quantity: number; unitPrice: number };
type WorkItemPricingInput = { hours: number; parts: readonly WorkItemPartPricingInput[] };
type WorkItemPricingBundle = { hourlyRate: number; items: readonly WorkItemPricingInput[] };

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
  quotedBasePrice,
  selectedAssemblyPrices = [],
  workItems,
}: {
  discountPercent: number;
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
  workItems?: WorkItemPricingBundle | undefined;
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const workItemTotal = computeQuoteWorkItemsTotal(workItems);
  const discountableSubtotal = Math.max(0, quotedBasePrice + selectedAssemblyTotal + workItemTotal);

  return roundCurrency(discountableSubtotal * (discountPercent / 100));
}

export function computeWorkItemLabourCost(input: { hourlyRate: number; hours: number }): number {
  return roundCurrency(input.hourlyRate * input.hours);
}

export function computeWorkItemPartAmount(part: WorkItemPartPricingInput): number {
  return part.quantity * part.unitPrice;
}

export function computeWorkItemTotal(input: {
  hourlyRate: number;
  hours: number;
  parts: readonly WorkItemPartPricingInput[];
}): number {
  return (
    computeWorkItemLabourCost(input) + input.parts.reduce((total, part) => total + computeWorkItemPartAmount(part), 0)
  );
}

function computeQuoteWorkItemsTotal(workItems: WorkItemPricingBundle | undefined): number {
  if (!workItems) return 0;

  return workItems.items.reduce(
    (total, item) => total + computeWorkItemTotal({ ...item, hourlyRate: workItems.hourlyRate }),
    0,
  );
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
  quotedBasePrice,
  selectedAssemblyPrices = [],
  workItems,
}: {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discountPercent: number;
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
  workItems?: WorkItemPricingBundle | undefined;
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const workItemTotal = computeQuoteWorkItemsTotal(workItems);
  const discountAmount = computeQuoteDiscountAmount({
    discountPercent,
    quotedBasePrice,
    selectedAssemblyPrices,
    workItems,
  });

  return (
    Math.max(0, quotedBasePrice + selectedAssemblyTotal + workItemTotal - discountAmount) +
    computeAdditionalDeliveryPrice({ deliveryIncluded, deliveryPrice })
  );
}

/** A Quote's stored pricing facts, excluding its selected assemblies. */
export type QuotePricingFacts = {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discountPercent: number;
  quotedBasePrice: number;
  workItems?: WorkItemPricingBundle | undefined;
};

type PersistedQuotePricingFacts = Omit<QuotePricingFacts, 'workItems'> &
  (
    | { hourlyRate: number; kind: 'custom'; workItems: readonly WorkItemPricingInput[] }
    | { hourlyRate?: never; kind: 'product'; workItems?: never }
  );

/**
 * Quote Pricing: the computed breakdown projected from a Quote's stored pricing facts.
 * `subtotal` is ex-VAT; `total` is the VAT-inclusive price shown to customers. Deposit (a
 * payment term) is not an input. `liveSelections` are the selections that contributed to the
 * total, returned as the same objects the caller supplied so each layer keeps its own richer
 * shape.
 */
export type QuotePricing<TSelection> = {
  discountAmount: number;
  liveSelections: readonly TSelection[];
  selectedAssemblyTotal: number;
  subtotal: number;
  total: number;
  vatAmount: number;
  vatPercent: number;
  workItemTotal: number;
};

function priceQuoteFromLiveSelections<TSelection extends { quotedPrice: number }>(
  facts: QuotePricingFacts,
  liveSelections: readonly TSelection[],
): QuotePricing<TSelection> {
  const selectedAssemblyPrices = liveSelections.map((selection) => selection.quotedPrice);
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const workItemTotal = computeQuoteWorkItemsTotal(facts.workItems);
  const subtotal = computeQuoteTotal({ ...facts, selectedAssemblyPrices });
  const vatAmount = computeQuoteVatAmount(subtotal);

  return {
    discountAmount: computeQuoteDiscountAmount({ ...facts, selectedAssemblyPrices }),
    liveSelections,
    selectedAssemblyTotal,
    subtotal,
    total: subtotal + vatAmount,
    vatAmount,
    vatPercent: VAT_PERCENT,
    workItemTotal,
  };
}

/**
 * Builds Quote Pricing from canonical pricing facts. A selected Optional Assembly is live when its
 * catalog reference survives: Assembly kind is immutable and deletion is `on delete set null`, so a
 * null `productAssemblyId` is the complete stale set and no product catalog is needed to total the
 * facts.
 */
export function priceQuote<TSelection extends { productAssemblyId: UUID | null; quotedPrice: number }>(
  quote: QuotePricingFacts & { selectedAssemblies: readonly TSelection[] },
): QuotePricing<TSelection> {
  const liveSelections = quote.selectedAssemblies.filter((selection) => selection.productAssemblyId !== null);

  return priceQuoteFromLiveSelections(quote, liveSelections);
}

/** Normalizes a persisted Quote's raw Work Item rows into the canonical pricing facts. */
export function pricePersistedQuote<TSelection extends { productAssemblyId: UUID | null; quotedPrice: number }>(
  quote: PersistedQuotePricingFacts & { selectedAssemblies: readonly TSelection[] },
): QuotePricing<TSelection> {
  if (quote.kind === 'product') return priceQuote(quote);

  const { hourlyRate, workItems, ...facts } = quote;

  return priceQuote({
    ...facts,
    workItems: { hourlyRate, items: workItems },
  });
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
