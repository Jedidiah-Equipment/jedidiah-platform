import {
  type QuoteDeliveryTerms,
  QuoteDeliveryTerms as QuoteDeliveryTermsSchema,
  type QuoteKind,
  type QuoteOfferingType,
  type QuoteProductSource,
  type QuoteStatus,
} from '@pkg/schema/equipment';

import { formatCurrency } from '../../formatting/number.js';

import {
  type BadgeColorClassNames,
  cancelledBadgeColorClassNames,
  statusBadgeColorClassNames,
} from '../../theme/status-badge.js';
import type { QuoteOfferingFacts } from './quote-offering.js';

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  accepted: 'Accepted',
  cancelled: 'Cancelled',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
};

/** Tailwind classes split so native surfaces can put the text colour on the Text element. */
export const quoteStatusColorClassNames: Record<QuoteStatus, BadgeColorClassNames> = {
  accepted: statusBadgeColorClassNames.green,
  cancelled: cancelledBadgeColorClassNames,
  draft: statusBadgeColorClassNames.gray,
  rejected: statusBadgeColorClassNames.red,
  sent: statusBadgeColorClassNames.blue,
};

/** The dropdown and summary wording for each Delivery Term; the PDF spells Ex factory out further. */
export const quoteDeliveryTermsLabels: Record<QuoteDeliveryTerms, string> = {
  additional_charge: 'Additional charge',
  ex_factory: 'Ex factory',
  included: 'Included in sale price',
  tbc: 'To be confirmed',
};

export const quoteDeliveryTermsOptions = QuoteDeliveryTermsSchema.options.map((deliveryTerms) => ({
  label: quoteDeliveryTermsLabels[deliveryTerms],
  value: deliveryTerms,
}));

/**
 * The Delivery line of a pricing summary: the charge when there is one, the term when it costs
 * nothing but the customer should still see it, and nothing at all for Included.
 */
export function formatQuoteDeliverySummary(summary: {
  currencyCode: string;
  deliveryPrice: number;
  deliveryTerms: QuoteDeliveryTerms;
}): string | null {
  switch (summary.deliveryTerms) {
    case 'included':
      return null;
    case 'additional_charge':
      return formatCurrency(summary.deliveryPrice, summary.currencyCode);
    default:
      return quoteDeliveryTermsLabels[summary.deliveryTerms];
  }
}

export const quoteKindLabels: Record<QuoteKind, string> = {
  custom: 'Service Work',
  product: 'Product',
};

/**
 * The one colour language for what a Quote or Job is selling: teal for Service Work, brand-adjacent
 * yellow for a Product build. Deliberately not the `primary` token — web's staging theme repaints
 * that pink, and the offering kind must not follow brand chrome.
 */
export const quoteKindColorClassNames: Record<QuoteKind, BadgeColorClassNames> = {
  custom: statusBadgeColorClassNames.teal,
  product: statusBadgeColorClassNames.yellow,
};

export function quoteOfferingType(quote: QuoteOfferingFacts): QuoteOfferingType {
  if (quote.kind === 'product') return 'product';

  return quote.isPartsSale ? 'parts-sale' : 'custom';
}

/** What people call each Quote type. The Job side still speaks in kinds, since a Parts Sale never reaches it. */
export const quoteOfferingTypeLabels: Record<QuoteOfferingType, string> = {
  custom: quoteKindLabels.custom,
  'parts-sale': 'Parts Sale',
  product: quoteKindLabels.product,
};

export function quoteOfferingTypeLabel(quote: QuoteOfferingFacts): string {
  return quoteOfferingTypeLabels[quoteOfferingType(quote)];
}

/** Parts Sale takes purple: no Quote or Job status uses it, and From Order, its other use, only marks Product Quotes. */
export const quoteOfferingTypeColorClassNames: Record<QuoteOfferingType, BadgeColorClassNames> = {
  custom: quoteKindColorClassNames.custom,
  'parts-sale': statusBadgeColorClassNames.purple,
  product: quoteKindColorClassNames.product,
};

export const quoteProductSourceLabels: Record<QuoteProductSource, string> = {
  order: 'From Order',
  stock: 'From Stock',
};

/**
 * From Stock borrows the Stock chip's yellow, because both say the same thing about the same machine:
 * we already hold it. From Order takes purple, a colour no Quote or Job status uses, so a Product
 * Source chip can never be misread as a status.
 */
export const quoteProductSourceColorClassNames: Record<QuoteProductSource, BadgeColorClassNames> = {
  order: statusBadgeColorClassNames.purple,
  stock: statusBadgeColorClassNames.yellow,
};

/**
 * Whether a Quote sells a machine we already hold or one still to be built. An Allocation Quote names
 * a Product Unit, so it reads From Stock; every other Product Quote is built to order. A Custom Quote
 * sells no Product at all and has no source — callers render nothing for `null`.
 */
export function quoteProductSourceOf(quote: {
  kind: QuoteKind;
  productUnitId: string | null;
}): QuoteProductSource | null {
  if (quote.kind !== 'product') {
    return null;
  }

  return quote.productUnitId === null ? 'order' : 'stock';
}

export type QuoteOfferingDisplaySource = {
  kind: QuoteKind;
  product: {
    buildTimeDays: number;
    modelCode: string;
    name: string;
  } | null;
  workTitle: string | null;
};

export type QuoteOfferingSubtitle = {
  text: string;
  mono: boolean;
};

export function getQuoteOfferingName(quote: QuoteOfferingDisplaySource): string {
  return quote.kind === 'custom' ? (quote.workTitle ?? quoteKindLabels.custom) : (quote.product?.name ?? '—');
}

export function getQuoteOfferingSubtitle(
  quote: QuoteOfferingDisplaySource & QuoteOfferingFacts,
): QuoteOfferingSubtitle | null {
  if (quote.kind === 'custom') {
    return { mono: false, text: quoteOfferingTypeLabel(quote) };
  }

  const modelCode = quote.product?.modelCode ?? '—';
  const buildTime = quote.product ? `${quote.product.buildTimeDays}d build` : '—';

  return { mono: false, text: `${modelCode} / ${buildTime}` };
}
