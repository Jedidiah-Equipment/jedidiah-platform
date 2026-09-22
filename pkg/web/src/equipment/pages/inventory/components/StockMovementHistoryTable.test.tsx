import { StockMovementHistoryResult } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params, to }: { children: React.ReactNode; params: Record<string, string>; to: string }) => (
    <a href={to.replace(/\$(\w+)/, (_, key: string) => params[key] ?? '')}>{children}</a>
  ),
}));

import { StockMovementHistoryTable } from './StockMovementHistoryTable.js';

const result = StockMovementHistoryResult.parse({
  items: [
    {
      actorName: 'Test User',
      actorUserId: 'test-user-id',
      createdAt: '2026-08-01T08:00:00.000Z',
      delta: 10,
      id: '00000000-0000-4000-8000-000000000010',
      jobId: null,
      lengthMm: null,
      movementType: 'adjustment',
      movementValue: 250,
      note: null,
      partId: '00000000-0000-4000-8000-000000000001',
      buildId: null,
      purchaseOrderId: null,
      purchaseOrderCode: null,
      jobCode: null,
      quoteCode: null,
      quoteId: null,
      stocktakeSessionId: null,
      stocktakeSessionScope: null,
      recipientName: null,
      recipientUserId: null,
      sourceCheckoutCreatedAt: null,
      sourceCheckoutId: null,
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
      jobId: null,
      lengthMm: null,
      movementType: 'revaluation',
      movementValue: null,
      note: 'Supplier repriced',
      partId: '00000000-0000-4000-8000-000000000001',
      buildId: null,
      purchaseOrderId: null,
      purchaseOrderCode: null,
      jobCode: null,
      quoteCode: null,
      quoteId: null,
      stocktakeSessionId: null,
      stocktakeSessionScope: null,
      recipientName: null,
      recipientUserId: null,
      sourceCheckoutCreatedAt: null,
      sourceCheckoutId: null,
      reason: null,
      runningBalance: 10,
      unitCost: 30,
    },
    {
      actorName: 'Test User',
      actorUserId: 'test-user-id',
      createdAt: '2026-08-01T10:00:00.000Z',
      delta: -1,
      id: '00000000-0000-4000-8000-000000000012',
      jobId: '00000000-0000-4000-8000-000000000099',
      lengthMm: null,
      movementType: 'checkout',
      movementValue: -30,
      note: null,
      partId: '00000000-0000-4000-8000-000000000001',
      buildId: null,
      purchaseOrderId: null,
      purchaseOrderCode: null,
      jobCode: 'JOB-00018',
      quoteCode: null,
      quoteId: null,
      stocktakeSessionId: null,
      stocktakeSessionScope: null,
      recipientName: null,
      recipientUserId: null,
      sourceCheckoutCreatedAt: null,
      sourceCheckoutId: null,
      reason: null,
      runningBalance: 9,
      unitCost: 30,
    },
    {
      actorName: 'Test User',
      actorUserId: 'test-user-id',
      buildId: null,
      createdAt: '2026-08-01T11:00:00.000Z',
      delta: 4,
      id: '00000000-0000-4000-8000-000000000013',
      jobId: null,
      lengthMm: null,
      movementType: 'receipt',
      movementValue: 100,
      note: null,
      partId: '00000000-0000-4000-8000-000000000001',
      purchaseOrderId: '00000000-0000-4000-8000-000000000098',
      purchaseOrderCode: 'PO-00042',
      jobCode: null,
      quoteCode: null,
      quoteId: null,
      stocktakeSessionId: null,
      stocktakeSessionScope: null,
      recipientName: null,
      recipientUserId: null,
      sourceCheckoutCreatedAt: null,
      sourceCheckoutId: null,
      reason: null,
      runningBalance: 13,
      unitCost: 25,
    },
    {
      actorName: 'Piet Storeman',
      actorUserId: 'test-user-id',
      buildId: null,
      createdAt: '2026-08-01T12:00:00.000Z',
      delta: -1,
      id: '00000000-0000-4000-8000-000000000014',
      jobId: null,
      jobCode: null,
      quoteCode: null,
      quoteId: null,
      lengthMm: null,
      movementType: 'adjustment',
      movementValue: -25,
      note: null,
      partId: '00000000-0000-4000-8000-000000000001',
      purchaseOrderId: null,
      purchaseOrderCode: null,
      reason: 'stock-count',
      runningBalance: 12,
      stocktakeSessionId: '00000000-0000-4000-8000-000000000097',
      stocktakeSessionScope: 'stores',
      recipientName: null,
      recipientUserId: null,
      sourceCheckoutCreatedAt: null,
      sourceCheckoutId: null,
      unitCost: 25,
    },
  ],
  part: {
    code: 'P-100',
    id: '00000000-0000-4000-8000-000000000001',
    isInternallyFabricated: false,
    name: 'Bearing',
    stockTrackingMode: 'perpetual',
    unitOfMeasure: 'piece',
  },
});

describe('StockMovementHistoryTable', () => {
  it('shows movement details, actor, running balance, and cost-bearing values', () => {
    const html = renderToStaticMarkup(
      <StockMovementHistoryTable
        canReadJobs={true}
        canReadQuotes={true}
        items={result.items}
        showCosts={true}
        unitOfMeasure="piece"
      />,
    );

    expect(html).toContain('Opening balance');
    expect(html).toContain('Revaluation');
    expect(html).toContain('Checkout');
    expect(html).toContain('Receipt');
    expect(html).toContain('PO-00042');
    expect(html).toContain('/equipment/purchase-orders/00000000-0000-4000-8000-000000000098');
    // Every reference kind is followable, not only the order one: a draw names its Job and a
    // stock count names the walk that posted it.
    expect(html).toContain('JOB-00018');
    expect(html).toContain('/equipment/jobs/00000000-0000-4000-8000-000000000099');
    expect(html).toContain('Stores count');
    expect(html).toContain('/equipment/inventory/stocktake/00000000-0000-4000-8000-000000000097');
    expect(html).toContain('10 pc');
    expect(html).toContain('Test User');
    expect(html).toContain('Supplier repriced');
    expect(html).toContain('R 25.00');
    expect(html).toContain('R 250.00');
    expect(html).toContain('placeholder="Search inventory history..."');
    expect(html).toContain('5 of 5 movements');
  });

  it('removes cost columns for a caller without cost-read access', () => {
    const html = renderToStaticMarkup(
      <StockMovementHistoryTable
        canReadJobs={true}
        canReadQuotes={true}
        items={result.items}
        showCosts={false}
        unitOfMeasure="piece"
      />,
    );

    expect(html).not.toContain('Unit cost');
    expect(html).not.toContain('Movement value');
    expect(html).not.toContain('R 25.00');
  });

  it('names the Job without linking it for a caller who cannot open Jobs', () => {
    const html = renderToStaticMarkup(
      <StockMovementHistoryTable
        canReadJobs={false}
        canReadQuotes={true}
        items={result.items}
        showCosts={true}
        unitOfMeasure="piece"
      />,
    );

    // Stores reads this ledger and holds no `equipment_job:read`; the link would only reach a sheet that
    // refuses to load. The other references are unaffected.
    expect(html).toContain('JOB-00018');
    expect(html).not.toContain('/equipment/jobs/00000000-0000-4000-8000-000000000099');
    expect(html).toContain('/equipment/purchase-orders/00000000-0000-4000-8000-000000000098');
    expect(html).toContain('/equipment/inventory/stocktake/00000000-0000-4000-8000-000000000097');
  });

  it('names a Parts Sale draw by its Quote, links it only for a Quote reader, and offers it no linked return', () => {
    const checkout = result.items.find((item) => item.movementType === 'checkout');
    if (!checkout) throw new Error('Checkout fixture missing');
    const partsSaleDraw = {
      ...checkout,
      jobCode: null,
      jobId: null,
      note: null,
      quoteCode: 'QUO-00042',
      quoteId: '00000000-0000-4000-8000-000000000042',
      recipientName: null,
      recipientUserId: null,
    } as (typeof result.items)[number];
    const render = (canReadQuotes: boolean) =>
      renderToStaticMarkup(
        <StockMovementHistoryTable
          canReadJobs={true}
          canReadQuotes={canReadQuotes}
          items={[partsSaleDraw]}
          onReturnCheckout={() => undefined}
          showCosts={false}
          unitOfMeasure="piece"
        />,
      );

    expect(render(true)).toContain('/equipment/quotes/00000000-0000-4000-8000-000000000042/edit');
    expect(render(false)).toContain('QUO-00042');
    expect(render(false)).not.toContain('/equipment/quotes/');
    expect(render(true)).not.toContain('Return to Store');
  });
});
