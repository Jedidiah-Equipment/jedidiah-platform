import { StockOnHandResult } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { StockOnHandTable } from './StockOnHandTable.js';

const result = StockOnHandResult.parse({
  items: [
    {
      averageUnitCost: 0.1,
      asOfLastCount: '2026-08-01T08:00:00.000Z',
      committed: 3,
      free: 3,
      isInternallyFabricated: false,
      lengthMm: 6_000,
      partCode: 'RAW-100',
      partId: '00000000-0000-4000-8000-000000000001',
      partName: 'Channel',
      quantity: 2,
      standardPurchaseLengthMm: 6_000,
      stockTrackingMode: 'periodic',
      totalValue: 1_200,
      unitOfMeasure: 'mm',
    },
    {
      averageUnitCost: 0.1,
      asOfLastCount: '2026-08-01T08:00:00.000Z',
      committed: 3,
      free: 3,
      isInternallyFabricated: false,
      lengthMm: 3_000,
      partCode: 'RAW-100',
      partId: '00000000-0000-4000-8000-000000000001',
      partName: 'Channel',
      quantity: 1,
      standardPurchaseLengthMm: 6_000,
      stockTrackingMode: 'periodic',
      totalValue: 300,
      unitOfMeasure: 'mm',
    },
    {
      averageUnitCost: null,
      asOfLastCount: null,
      committed: 1,
      free: 3,
      isInternallyFabricated: false,
      lengthMm: null,
      partCode: 'P-100',
      partId: '00000000-0000-4000-8000-000000000002',
      partName: 'Bearing',
      quantity: 4,
      standardPurchaseLengthMm: null,
      stockTrackingMode: 'perpetual',
      totalValue: null,
      unitOfMeasure: 'piece',
    },
  ],
});

describe('StockOnHandTable', () => {
  it('shows linear buckets, periodic count age, honest missing cost, and history actions to cost readers', () => {
    const html = renderToStaticMarkup(
      <StockOnHandTable items={result.items} onOpenHistory={vi.fn()} showCosts={true} />,
    );

    expect(html).toContain('6 m × 2');
    expect(html).toContain('3 m × 1');
    expect(html).toContain('As of last count 1 Aug 2026');
    expect(html).toContain('R 0.10/mm');
    expect(html).toContain('R 1 200.00');
    expect(html).toContain('No cost yet');
    expect(html).toContain('Free');
    expect(html.match(/3 pieces/g)).toHaveLength(1);
    expect(html).toContain('3 pc');
    expect(html.match(/View history/g)).toHaveLength(3);
  });

  it('removes all cost columns for a caller without cost-read access', () => {
    const html = renderToStaticMarkup(
      <StockOnHandTable items={result.items} onOpenHistory={vi.fn()} showCosts={false} />,
    );

    expect(html).not.toContain('Average cost');
    expect(html).not.toContain('Value');
    expect(html).not.toContain('R 0.10/mm');
    expect(html).not.toContain('No cost yet');
  });
});
