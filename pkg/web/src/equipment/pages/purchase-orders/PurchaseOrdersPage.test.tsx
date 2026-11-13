import type { PurchaseOrderView } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./PurchaseOrderCreateDialog.js', () => ({ PurchaseOrderCreateDialog: () => null }));

import { PurchaseOrderTable } from './PurchaseOrdersPage.js';

const purchaseOrder = {
  code: 'PO-00001',
  derivedStatus: 'draft',
  expectedDeliveryDate: '2026-08-12',
  id: '00000000-0000-4000-8000-000000000001',
  jobs: [],
  lines: [{ quantity: 2, unitPrice: 5 }],
  status: 'draft',
  supplier: { companyName: 'Bearing & Bolt' },
} as unknown as PurchaseOrderView;

describe('PurchaseOrderTable', () => {
  it('uses the searchable complete DataTable with whole-row navigation', () => {
    const html = renderToStaticMarkup(<PurchaseOrderTable canReadCosts items={[purchaseOrder]} onOpen={vi.fn()} />);

    expect(html).toContain('placeholder="Search purchase orders..."');
    expect(html).toContain('aria-label="Open PO-00001"');
    expect(html).toContain('Bearing &amp; Bolt');
    expect(html).toContain('Restock');
    expect(html).toContain('R 10.00');
    expect(html).toContain('1 of 1 Purchase Order');
  });

  it('omits totals without inventory cost access', () => {
    const html = renderToStaticMarkup(
      <PurchaseOrderTable canReadCosts={false} items={[purchaseOrder]} onOpen={vi.fn()} />,
    );

    expect(html).not.toContain('>Total<');
    expect(html).not.toContain('R 10.00');
  });

  it('names whose each linked Job is, reading a held machine as Stock', () => {
    const linked = {
      ...purchaseOrder,
      jobs: [
        { code: 'JOB-00007', customerCompanyName: 'Karoo Farms', id: '8c6f2a1e-4d3b-4c5a-9e8f-7a6b5c4d3e2f' },
        { code: 'JOB-00009', customerCompanyName: null, id: '9c6f2a1e-4d3b-4c5a-9e8f-7a6b5c4d3e2f' },
      ],
    } as unknown as PurchaseOrderView;

    const html = renderToStaticMarkup(<PurchaseOrderTable canReadCosts items={[linked]} onOpen={vi.fn()} />);

    expect(html).toMatch(
      /<span[^>]*class="block max-w-sm truncate"[^>]*data-slot="tooltip-trigger"[^>]*>JOB-00007 · Karoo Farms, JOB-00009 · Stock</,
    );
  });

  it('labels zero-sentinel draft prices as not priced rather than free', () => {
    const unpriced = {
      ...purchaseOrder,
      lines: [{ quantity: 2, unitPrice: 0 }],
    } as unknown as PurchaseOrderView;

    const html = renderToStaticMarkup(<PurchaseOrderTable canReadCosts items={[unpriced]} onOpen={vi.fn()} />);

    expect(html).toContain('Not priced');
    expect(html).not.toContain('R 0.00');
  });
});
