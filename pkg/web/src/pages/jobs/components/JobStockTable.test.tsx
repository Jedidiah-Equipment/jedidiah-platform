import { JobStockResult } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JobStockTable } from './JobStockTable.js';

describe('JobStockTable', () => {
  it('shows CFO, drawn, committed, free, on order, and linear draw buckets', () => {
    const result = JobStockResult.parse({
      items: [
        {
          cfoQuantity: 5,
          committedQuantity: 3,
          drawnQuantity: 2,
          freeQuantity: -1,
          isInternallyFabricated: false,
          lengthBuckets: [{ drawnQuantity: 2, lengthMm: 6_000 }],
          onOrder: 4,
          partCode: 'RAW-100',
          partId: '00000000-0000-4000-8000-000000000001',
          partName: 'Channel',
          standardPurchaseLengthMm: 6_000,
          stockTrackingMode: 'perpetual',
          supplierName: 'Acme Steel',
          unitOfMeasure: 'mm',
        },
      ],
      job: {
        cancelledAt: null,
        closedOutAt: null,
        code: 1,
        completedOn: null,
        displayName: 'Channel fabrication',
        id: '00000000-0000-4000-8000-000000000009',
      },
    });

    const html = renderToStaticMarkup(<JobStockTable items={result.items} />);

    expect(html).toContain('Search Job stock...');
    expect(html).toContain('1 part');
    expect(html).toContain('rounded-lg border');
    expect(html).not.toContain('aria-label="Filter ');
    expect(html).toContain('CFO');
    expect(html).toContain('Drawn');
    expect(html).toContain('Committed');
    // Free and On order are the two figures buying is decided against (spec §3).
    expect(html).toContain('Free');
    expect(html).toContain('On order');
    expect(html).toContain('6 m × 2');
  });
});
