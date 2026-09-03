import type { QuoteKind, QuoteProductSource, QuoteStatus } from '@pkg/schema';

import {
  type BadgeColorClassNames,
  cancelledBadgeColorClassNames,
  statusBadgeColorClassNames,
} from '../../theme/status-badge.js';

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
  kind: 'product' | 'custom';
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

export function getQuoteOfferingSubtitle(quote: QuoteOfferingDisplaySource): QuoteOfferingSubtitle | null {
  if (quote.kind === 'custom') {
    return { mono: false, text: quoteKindLabels.custom };
  }

  const modelCode = quote.product?.modelCode ?? '—';
  const buildTime = quote.product ? `${quote.product.buildTimeDays}d build` : '—';

  return { mono: false, text: `${modelCode} / ${buildTime}` };
}
