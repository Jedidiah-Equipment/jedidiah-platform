import type { QuoteSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getNextQuotePage,
  isQuoteStatusFilter,
  presentQuotePages,
  quoteMetaLine,
  quoteStatusColorClassNames,
  quoteStatusLabels,
} from './quote-presentation';

describe('Quote status presentation', () => {
  it('labels every Quote status the same way as the web list', () => {
    expect(quoteStatusLabels).toEqual({
      accepted: 'Accepted',
      cancelled: 'Cancelled',
      draft: 'Draft',
      rejected: 'Rejected',
      sent: 'Sent',
    });
  });

  it('accepts only All and the five real statuses as persisted filters', () => {
    for (const value of ['all', 'draft', 'sent', 'accepted', 'rejected', 'cancelled']) {
      expect(isQuoteStatusFilter(value)).toBe(true);
    }

    expect(isQuoteStatusFilter('locked')).toBe(false);
    expect(isQuoteStatusFilter(null)).toBe(false);
  });

  it('keeps the web status colors, including orange for Cancelled Quotes', () => {
    expect(quoteStatusColorClassNames).toEqual({
      accepted: {
        chip: 'border-emerald-500/50 bg-emerald-500/15',
        text: 'text-emerald-800 dark:text-emerald-200',
      },
      cancelled: {
        chip: 'border-orange-500/50 bg-orange-500/15',
        text: 'text-orange-800 dark:text-orange-200',
      },
      draft: { chip: 'border-gray-400/50 bg-gray-500/10', text: 'text-gray-700 dark:text-gray-200' },
      rejected: { chip: 'border-red-500/50 bg-red-500/15', text: 'text-red-800 dark:text-red-200' },
      sent: { chip: 'border-blue-500/50 bg-blue-500/15', text: 'text-blue-800 dark:text-blue-200' },
    });
  });
});

describe('quoteMetaLine', () => {
  it('describes Custom Quotes without Product facts', () => {
    expect(quoteMetaLine({ kind: 'custom' })).toBe('Custom work');
  });

  it('shows Product model, build time, and only live selected options', () => {
    expect(
      quoteMetaLine({
        kind: 'product',
        product: { buildTimeDays: 14, modelCode: 'FF 5000' },
        selectedAssemblies: [{ productAssemblyId: 'live' }, { productAssemblyId: null }],
      }),
    ).toBe('FF 5000 · 14 days · 1 option');
  });
});

describe('paged Quote presentation', () => {
  const quote = (id: string) => ({ id }) as QuoteSummary;

  it('keeps priority Quotes pinned and removes their duplicates from loaded pages', () => {
    const sections = presentQuotePages(
      [{ items: [quote('quote-1'), quote('quote-2')] }, { items: [quote('quote-3')] }],
      [quote('quote-2')],
    );

    expect(sections.priorityQuotes.map((item) => item.id)).toEqual(['quote-2']);
    expect(sections.mainQuotes.map((item) => item.id)).toEqual(['quote-1', 'quote-3']);
  });

  it('loads the next numbered page while fewer items than the server total are loaded', () => {
    expect(
      getNextQuotePage({ items: Array.from({ length: 20 }), total: 45 }, [{ items: Array.from({ length: 20 }) }]),
    ).toBe(2);

    expect(
      getNextQuotePage({ items: Array.from({ length: 5 }), total: 45 }, [
        { items: Array.from({ length: 20 }) },
        { items: Array.from({ length: 20 }) },
        { items: Array.from({ length: 5 }) },
      ]),
    ).toBeUndefined();
  });
});
