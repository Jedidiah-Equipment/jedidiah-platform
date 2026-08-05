import type { QuoteStatus } from '@pkg/schema';

import { statusBadgeColorClassNames } from '../theme/status-badge.js';

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  accepted: 'Accepted',
  cancelled: 'Cancelled',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
};

/** Tailwind classes split so native surfaces can put `text` on the Text element. */
export const quoteStatusColorClassNames: Record<QuoteStatus, { chip: string; text: string }> = {
  accepted: statusBadgeColorClassNames.green,
  cancelled: statusBadgeColorClassNames.orange,
  draft: statusBadgeColorClassNames.gray,
  rejected: statusBadgeColorClassNames.red,
  sent: statusBadgeColorClassNames.blue,
};

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
  return quote.kind === 'custom' ? (quote.workTitle ?? 'Custom work') : (quote.product?.name ?? '—');
}

export function getQuoteOfferingSubtitle(quote: QuoteOfferingDisplaySource): QuoteOfferingSubtitle | null {
  if (quote.kind === 'custom') {
    return { mono: false, text: 'Custom work' };
  }

  const modelCode = quote.product?.modelCode ?? '—';
  const buildTime = quote.product ? `${quote.product.buildTimeDays}d build` : '—';

  return { mono: false, text: `${modelCode} / ${buildTime}` };
}
