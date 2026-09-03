import { StaleSentQuote } from '@pkg/schema';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { getDashboardQuoteThumbnailDataUrl } from '../DashboardQuoteIdentity.js';
import { StaleSentQuoteRowContent } from './StaleSentQuotesWidget.js';

describe('StaleSentQuoteRowContent', () => {
  it.each([
    ['product', 'tabler-icon-package', 'tabler-icon-tools'],
    ['custom', 'tabler-icon-tools', 'tabler-icon-package'],
  ] as const)('shows the %s offering identity', async (kind, expectedIcon, otherIcon) => {
    const quote = StaleSentQuote.parse({
      code: 34,
      currencyCode: 'ZAR',
      customerCompanyName: 'Tim Gibson',
      customerThumbnailDataUrl: null,
      id: '10000000-0000-4000-8000-000000000000',
      job: null,
      kind,
      product:
        kind === 'product'
          ? {
              buildTimeDays: 10,
              currencyCode: 'ZAR',
              modelCode: 'TRL-1',
              name: 'Trailer',
              thumbnailDataUrl: 'data:image/webp;base64,cHJvZHVjdA==',
            }
          : null,
      sentDaysAgo: 12,
      statusChangedAt: '2026-08-01T08:00:00.000Z',
      totalValue: 1_500,
      workTitle: kind === 'custom' ? 'Trailer repair' : null,
    });
    const html = await renderWithRouter(createElement(StaleSentQuoteRowContent, { canOpenJobs: false, quote }));

    expect(html).toContain('data-size="default"');
    if (kind === 'product') {
      expect(getDashboardQuoteThumbnailDataUrl(quote)).toBe('data:image/webp;base64,cHJvZHVjdA==');
    } else {
      expect(getDashboardQuoteThumbnailDataUrl(quote)).toBeNull();
    }
    expect(html).toContain(expectedIcon);
    expect(html).not.toContain(otherIcon);
    expect(html.indexOf('Tim Gibson')).toBeLessThan(html.indexOf('QUO-00034'));
    expect(html.match(/href="\/equipment\/quotes\/10000000-0000-4000-8000-000000000000\/edit"/g)).toHaveLength(2);
  });
});
