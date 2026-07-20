import { QuoteStatus, type QuoteSummary } from '@pkg/schema';

export type QuoteStatusFilter = 'all' | QuoteSummary['status'];

export const quoteStatusLabels = {
  accepted: 'Accepted',
  cancelled: 'Cancelled',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
} as const satisfies Record<QuoteSummary['status'], string>;

export const quoteStatusColorClassNames = {
  accepted: { chip: 'border-emerald-500/50 bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-200' },
  cancelled: { chip: 'border-orange-500/50 bg-orange-500/15', text: 'text-orange-800 dark:text-orange-200' },
  draft: { chip: 'border-gray-400/50 bg-gray-500/10', text: 'text-gray-700 dark:text-gray-200' },
  rejected: { chip: 'border-red-500/50 bg-red-500/15', text: 'text-red-800 dark:text-red-200' },
  sent: { chip: 'border-blue-500/50 bg-blue-500/15', text: 'text-blue-800 dark:text-blue-200' },
} as const satisfies Record<QuoteSummary['status'], { chip: string; text: string }>;

export function isQuoteStatusFilter(value: unknown): value is QuoteStatusFilter {
  return value === 'all' || QuoteStatus.safeParse(value).success;
}

type QuoteMetaFacts =
  | { kind: 'custom' }
  | {
      kind: 'product';
      product: Pick<NonNullable<QuoteSummary['product']>, 'buildTimeDays' | 'modelCode'>;
      selectedAssemblies: readonly { productAssemblyId: string | null }[];
    };

export function quoteMetaLine(quote: QuoteMetaFacts): string {
  if (quote.kind === 'custom') return 'Custom work';

  const liveOptionCount = quote.selectedAssemblies.filter((selection) => selection.productAssemblyId !== null).length;
  const optionSuffix = liveOptionCount === 0 ? '' : ` · ${liveOptionCount} option${liveOptionCount === 1 ? '' : 's'}`;

  return `${quote.product.modelCode} · ${quote.product.buildTimeDays} days${optionSuffix}`;
}

type QuotePage<T> = { items: readonly T[] };

export function presentQuotePages<T extends { id: string }>(
  pages: readonly QuotePage<T>[],
  priorityQuotes: readonly T[],
): { priorityQuotes: T[]; mainQuotes: T[] } {
  const priorityIds = new Set(priorityQuotes.map((quote) => quote.id));
  const mainQuotes = pages.flatMap((page) => page.items).filter((quote) => !priorityIds.has(quote.id));

  return { priorityQuotes: [...priorityQuotes], mainQuotes };
}

export function getNextQuotePage<T>(
  lastPage: QuotePage<T> & { total: number },
  pages: readonly QuotePage<T>[],
): number | undefined {
  const loaded = pages.reduce((count, page) => count + page.items.length, 0);

  return loaded < lastPage.total ? pages.length + 1 : undefined;
}
