import type { PurchaseOrderView } from '@pkg/schema';
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
  supplier: { companyName: 'Bearing & Bolt' },
} as unknown as PurchaseOrderView;

describe('PurchaseOrderTable', () => {
  it('uses the searchable complete DataTable with whole-row navigation', () => {
    const html = renderToStaticMarkup(<PurchaseOrderTable canReadCosts items={[purchaseOrder]} onOpen={vi.fn()} />);

    expect(html).toContain('placeholder="Search Purchase Orders..."');
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
});
