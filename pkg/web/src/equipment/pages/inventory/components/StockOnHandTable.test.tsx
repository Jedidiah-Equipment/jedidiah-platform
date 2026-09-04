import { StockOnHandResult } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { StockOnHandTable } from './StockOnHandTable.js';

const result = StockOnHandResult.parse({
  items: [
    {
      averageUnitCost: 0.1,
      asOfLastCount: '2026-08-01T08:00:00.000Z',
      buckets: [
        { lengthMm: 3_000, quantity: 1, totalValue: 300 },
        { lengthMm: 6_000, quantity: 2, totalValue: 1_200 },
      ],
      committed: 3,
      estimatedOnHand: null,
      free: 3,
      isInternallyFabricated: false,
      onOrder: 2,
      partCode: 'RAW-100',
      partId: '00000000-0000-4000-8000-000000000001',
      partName: 'Channel',
      quantity: 3,
      standardPurchaseLengthMm: 6_000,
      stockTrackingMode: 'periodic',
      totalValue: 1_500,
      unitOfMeasure: 'mm',
    },
    {
      averageUnitCost: null,
      asOfLastCount: null,
      buckets: [{ lengthMm: null, quantity: 4, totalValue: null }],
      committed: 1,
      estimatedOnHand: { openPlateRemainingPercent: 94, wholeUnits: 3 },
      free: 3,
      isInternallyFabricated: false,
      onOrder: 0,
      partCode: 'P-100',
      partId: '00000000-0000-4000-8000-000000000002',
      partName: 'Bearing',
      quantity: 4,
      standardPurchaseLengthMm: null,
      stockTrackingMode: 'periodic',
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

    expect(html).toContain('Search stock on hand...');
    expect(html).toContain('2 parts');
    expect(html).toContain('rounded-lg border');
    expect(html).not.toContain('aria-label="Filter ');
    // One row per Part now, with its length buckets listed underneath the piece count.
    expect(html).toContain('6 m × 2');
    expect(html).toContain('3 m × 1');
    expect(html).toContain('As of last count 1 Aug 2026');
    expect(html).toContain('R 0.10/mm');
    expect(html).toContain('R 1 500.00');
    expect(html).toContain('No cost yet');
    expect(html).toContain('≈ 3 plates + 94% of one.');
    expect(html).toContain('Free');
    expect(html).toContain('On order');
    expect(html).toContain('2 pieces');
    expect(html.match(/3 pieces/g)).toHaveLength(2);
    expect(html).toContain('3 pc');
    expect(html.match(/View history/g)).toHaveLength(2);
  });

  it('flags negative stock on hand and negative length buckets as the exceptions they are', () => {
    const negative = StockOnHandResult.parse({
      items: [
        {
          averageUnitCost: null,
          asOfLastCount: null,
          buckets: [
            { lengthMm: 6_000, quantity: -1, totalValue: null },
            { lengthMm: 3_000, quantity: 2, totalValue: null },
          ],
          committed: 0,
          estimatedOnHand: null,
          free: -2,
          isInternallyFabricated: false,
          onOrder: 0,
          partCode: 'P-200',
          partId: '00000000-0000-4000-8000-000000000003',
          partName: 'Wheel kit',
          quantity: -2,
          standardPurchaseLengthMm: 6_000,
          stockTrackingMode: 'perpetual',
          totalValue: null,
          unitOfMeasure: 'mm',
        },
      ],
    });

    const html = renderToStaticMarkup(
      <StockOnHandTable items={negative.items} onOpenHistory={vi.fn()} showCosts={false} />,
    );

    // The count itself and the bucket that went short, and nothing else.
    expect(html.match(/Negative stock/g)).toHaveLength(2);
    expect(html).toContain('-2 pieces');
    expect(html).toContain('6 m × -1');
  });

  it('leaves positive stock and negative free stock unflagged', () => {
    const oversold = StockOnHandResult.parse({
      items: [
        {
          averageUnitCost: null,
          asOfLastCount: null,
          buckets: [{ lengthMm: null, quantity: 4, totalValue: null }],
          committed: 6,
          estimatedOnHand: null,
          free: -2,
          isInternallyFabricated: false,
          onOrder: 0,
          partCode: 'P-300',
          partId: '00000000-0000-4000-8000-000000000004',
          partName: 'Auger pin',
          quantity: 4,
          standardPurchaseLengthMm: null,
          stockTrackingMode: 'perpetual',
          totalValue: null,
          unitOfMeasure: 'piece',
        },
      ],
    });

    const html = renderToStaticMarkup(
      <StockOnHandTable items={[...result.items, ...oversold.items]} onOpenHistory={vi.fn()} showCosts={true} />,
    );

    expect(html).not.toContain('Negative stock');
    expect(html).toContain('-2 pc');
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
