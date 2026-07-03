export type QuoteOfferingDisplaySource = {
  kind: 'product' | 'custom';
  productBuildTimeDays: number | null;
  productModelCode: string | null;
  productName: string | null;
  workTitle: string | null;
};

export type QuoteOfferingSubtitle = {
  text: string;
  mono: boolean;
};

export function getQuoteOfferingName(quote: QuoteOfferingDisplaySource): string {
  return quote.kind === 'custom' ? (quote.workTitle ?? 'Custom work') : (quote.productName ?? '—');
}

export function getQuoteOfferingSubtitle(quote: QuoteOfferingDisplaySource): QuoteOfferingSubtitle | null {
  if (quote.kind === 'custom') {
    return { mono: false, text: 'Custom work' };
  }

  const modelCode = quote.productModelCode ?? '—';
  const buildTime = quote.productBuildTimeDays === null ? '—' : `${quote.productBuildTimeDays}d build`;

  return { mono: false, text: `${modelCode} / ${buildTime}` };
}
