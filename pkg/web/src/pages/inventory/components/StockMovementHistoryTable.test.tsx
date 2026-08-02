import { StockMovementHistoryResult } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StockMovementHistoryTable } from './StockMovementHistoryTable.js';

const result = StockMovementHistoryResult.parse({
  items: [
    {
      actorName: 'Test User',
      actorUserId: 'test-user-id',
      createdAt: '2026-08-01T08:00:00.000Z',
      delta: 10,
      id: '00000000-0000-4000-8000-000000000010',
      lengthMm: null,
      movementType: 'adjustment',
      movementValue: 250,
      note: null,
      partId: '00000000-0000-4000-8000-000000000001',
      reason: 'opening-balance',
      runningBalance: 10,
      unitCost: 25,
    },
    {
      actorName: 'Test User',
      actorUserId: 'test-user-id',
      createdAt: '2026-08-01T09:00:00.000Z',
      delta: 0,
      id: '00000000-0000-4000-8000-000000000011',
      lengthMm: null,
      movementType: 'revaluation',
      movementValue: null,
      note: 'Supplier repriced',
      partId: '00000000-0000-4000-8000-000000000001',
      reason: null,
      runningBalance: 10,
      unitCost: 30,
    },
  ],
  part: {
    code: 'P-100',
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Bearing',
    unitOfMeasure: 'piece',
  },
});

describe('StockMovementHistoryTable', () => {
  it('shows movement details, actor, running balance, and cost-bearing values', () => {
    const html = renderToStaticMarkup(
      <StockMovementHistoryTable items={result.items} showCosts={true} unitOfMeasure="piece" />,
    );

    expect(html).toContain('Opening balance');
    expect(html).toContain('Revaluation');
    expect(html).toContain('10 pc');
    expect(html).toContain('Test User');
    expect(html).toContain('Supplier repriced');
    expect(html).toContain('R 25.00');
    expect(html).toContain('R 250.00');
  });

  it('removes cost columns for a caller without cost-read access', () => {
    const html = renderToStaticMarkup(
      <StockMovementHistoryTable items={result.items} showCosts={false} unitOfMeasure="piece" />,
    );

    expect(html).not.toContain('Unit cost');
    expect(html).not.toContain('Movement value');
    expect(html).not.toContain('R 25.00');
  });
});
