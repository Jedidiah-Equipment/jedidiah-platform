import type { Assembly, QuoteDetail, QuoteSelectedAssembly, QuoteSelectedAssemblyInput } from '@pkg/schema';

import { computeAdditionalDeliveryPrice, priceQuoteWithCatalog } from './quote-pricing.js';

export type QuoteSummaryLineItem = { name: string; quantity: number; unitPrice: number };

/** The slice of edit-form state the live pricing summary depends on. */
export type QuoteSummaryFormValues = {
  basePrice: number;
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountPercent: number;
  lineItems: QuoteSummaryLineItem[];
  selectedAssemblies: QuoteSelectedAssemblyInput[];
};

export type SelectedAssemblySnapshot = Pick<
  QuoteSelectedAssembly,
  'id' | 'productAssemblyId' | 'quotedName' | 'quotedPrice'
>;

export type QuoteComputedSummary = {
  basePrice: number;
  currencyCode: string;
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountAmount: number;
  discountPercent: number;
  lineItems: QuoteSummaryLineItem[];
  lineItemTotal: number;
  selectedAssemblies: SelectedAssemblySnapshot[];
  selectedAssemblyTotal: number;
  subtotal: number;
  total: number;
  vatAmount: number;
  vatPercent: number;
};

/**
 * Resolves the form's assembly selections against the product catalog and the quote's existing
 * selections into display snapshots, dropping selections that no longer resolve.
 */
export function resolveSelectedAssemblySnapshots({
  catalogAssemblies,
  formSelections,
  initialSelections,
}: {
  catalogAssemblies: readonly Assembly[];
  formSelections: readonly QuoteSelectedAssemblyInput[];
  initialSelections: readonly QuoteSelectedAssembly[];
}): SelectedAssemblySnapshot[] {
  return formSelections
    .map((selection): SelectedAssemblySnapshot | null => {
      if (selection.type === 'existing') {
        return initialSelections.find((item) => item.id === selection.id) ?? null;
      }

      const assembly = catalogAssemblies.find(
        (item) => item.id === selection.productAssemblyId && item.kind === 'optional',
      );
      if (assembly?.kind !== 'optional') return null;

      return {
        id: assembly.id,
        productAssemblyId: assembly.id,
        quotedName: assembly.name,
        quotedPrice: assembly.price,
      };
    })
    .filter((selection): selection is SelectedAssemblySnapshot => selection !== null);
}

/**
 * Live VAT-inclusive pricing summary for the quote editors. Stale selections drop from the
 * on-screen preview, and live ones list in catalog display order — the same order the generated
 * Quote Document uses.
 */
export function computeQuoteSummary({
  quote,
  values,
}: {
  quote: QuoteDetail;
  values: QuoteSummaryFormValues;
}): QuoteComputedSummary {
  const catalogAssemblies = quote.product?.assemblies ?? [];
  const deliveryPrice = computeAdditionalDeliveryPrice(values);
  const basePrice = quote.kind === 'custom' ? values.basePrice : quote.quotedBasePrice;
  const selectedAssemblies =
    quote.kind === 'custom'
      ? []
      : resolveSelectedAssemblySnapshots({
          catalogAssemblies,
          formSelections: values.selectedAssemblies,
          initialSelections: quote.selectedAssemblies,
        });
  const pricing = priceQuoteWithCatalog(
    {
      deliveryIncluded: values.deliveryIncluded,
      deliveryPrice,
      discountPercent: values.discountPercent,
      lineItems: values.lineItems,
      quotedBasePrice: basePrice,
      selectedAssemblies,
    },
    catalogAssemblies,
  );

  return {
    basePrice,
    currencyCode: quote.product?.currencyCode ?? quote.quotedCurrencyCode,
    deliveryIncluded: values.deliveryIncluded,
    deliveryPrice,
    discountAmount: pricing.discountAmount,
    discountPercent: values.discountPercent,
    lineItems: values.lineItems,
    lineItemTotal: pricing.lineItemTotal,
    selectedAssemblies: [...pricing.liveSelections],
    selectedAssemblyTotal: pricing.selectedAssemblyTotal,
    subtotal: pricing.subtotal,
    total: pricing.total,
    vatAmount: pricing.vatAmount,
    vatPercent: pricing.vatPercent,
  };
}
