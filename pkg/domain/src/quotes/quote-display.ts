import type { QuoteStatus } from '@pkg/schema';

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  accepted: 'Accepted',
  cancelled: 'Cancelled',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
};

/** Tailwind classes split so native surfaces can put `text` on the Text element. */
export const quoteStatusColorClassNames: Record<QuoteStatus, { chip: string; text: string }> = {
  accepted: { chip: 'border-emerald-500/50 bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-200' },
  cancelled: { chip: 'border-orange-500/50 bg-orange-500/15', text: 'text-orange-800 dark:text-orange-200' },
  draft: { chip: 'border-gray-400/50 bg-gray-500/10', text: 'text-gray-700 dark:text-gray-200' },
  rejected: { chip: 'border-red-500/50 bg-red-500/15', text: 'text-red-800 dark:text-red-200' },
  sent: { chip: 'border-blue-500/50 bg-blue-500/15', text: 'text-blue-800 dark:text-blue-200' },
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
