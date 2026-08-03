import { JobStockResult } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JobStockTable } from './JobStockTable.js';

describe('JobStockTable', () => {
  it('shows CFO, drawn, committed, and linear draw buckets', () => {
    const result = JobStockResult.parse({
      items: [
        {
          cfoQuantity: 5,
          committedQuantity: 3,
          drawnQuantity: 2,
          lengthBuckets: [{ drawnQuantity: 2, lengthMm: 6_000 }],
          partCode: 'RAW-100',
          partId: '00000000-0000-4000-8000-000000000001',
          partName: 'Channel',
          standardPurchaseLengthMm: 6_000,
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

    expect(html).toContain('CFO');
    expect(html).toContain('Drawn');
    expect(html).toContain('Committed');
    expect(html).toContain('6 m × 2');
  });
});
