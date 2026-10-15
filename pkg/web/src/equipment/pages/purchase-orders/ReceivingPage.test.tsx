import type { DateOnlyIso } from '@pkg/schema';
import type { PurchaseOrderView } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children, params }: { children: React.ReactNode; params: { id: string } }) => (
    <a href={`/equipment/purchase-orders/${params.id}`}>{children}</a>
  ),
}));
vi.mock('@/equipment/pages/parts/part-label.js', () => ({ partLabelUrl: (partId: string) => `/labels/${partId}` }));
vi.mock('./components/PurchaseOrderArrivalDialog.js', () => ({ PurchaseOrderArrivalDialog: () => null }));
vi.mock('./components/PurchaseOrderReceiveDialog.js', () => ({ PurchaseOrderReceiveDialog: () => null }));

import { ReceivingList } from './ReceivingPage.js';

const TODAY = '2026-10-15' as DateOnlyIso;

function order(
  code: string,
  supplier: string,
  expectedDeliveryDate: string | null,
  lines: { partCode?: string; description: string; quantity: number; receivedQuantity: number }[],
) {
  return {
    actions: { receive: { allowed: true } },
    code,
    expectedDeliveryDate,
    id: `id-${code}`,
    lines: lines.map(({ partCode, ...line }, index) => ({
      ...line,
      id: `${code}-line-${index}`,
      ...(partCode ? { kind: 'part', partCode, partId: `part-${partCode}` } : { kind: 'custom' }),
    })),
    supplier: { companyName: supplier },
  } as unknown as PurchaseOrderView;
}

const late = order('PO-00041', 'Bearing & Bolt', '2026-10-01', [
  { description: 'Hydraulic hose', partCode: 'HOSE-12', quantity: 4, receivedQuantity: 4 },
  { description: 'Grease nipple', partCode: 'NIP-8', quantity: 10, receivedQuantity: 3 },
]);
const onTime = order('PO-00042', 'Steel Direct', '2026-10-20', [
  { description: 'Flat bar', partCode: 'FB-50', quantity: 6, receivedQuantity: 0 },
  { description: 'Packing tape', quantity: 2, receivedQuantity: 0 },
]);
const finished = order('PO-00043', 'Finished Supplies', null, [
  { description: 'Washer', partCode: 'WSH-10', quantity: 5, receivedQuantity: 5 },
]);

function render({ canReceive = true, items = [late, onTime, finished], search = '' } = {}) {
  return renderToStaticMarkup(
    <ReceivingList canReadCosts={false} canReceive={canReceive} items={items} search={search} today={TODAY} />,
  );
}

describe('ReceivingList', () => {
  it('groups owed lines under their order, hiding finished lines and finished orders', () => {
    const html = render();

    expect(html).toContain('href="/equipment/purchase-orders/id-PO-00041"');
    expect(html).toContain('Bearing &amp; Bolt');
    expect(html).toContain('Steel Direct');
    expect(html).not.toContain('HOSE-12');
    expect(html).toContain('NIP-8');
    expect(html).toContain('3 / 10');
    expect(html).toMatch(/3 \/ 10<\/td><td[^>]*>7</);
    expect(html).toContain('Expected 1 Oct 2026');
    expect(html).not.toContain('PO-00043');
    expect(html.indexOf('PO-00041')).toBeLessThan(html.indexOf('PO-00042'));
  });

  it('marks only an order whose expected date has passed as late', () => {
    expect(render({ items: [late] })).toContain('>Late<');
    expect(render({ items: [onTime] })).not.toContain('>Late<');
  });

  it('keeps a whole order on a code or Supplier match and narrows to the line on a Part match', () => {
    const byCode = render({ search: 'po-42' });
    expect(byCode).toContain('FB-50');
    expect(byCode).toContain('Packing tape');
    expect(byCode).not.toContain('PO-00041');

    expect(render({ search: 'steel' })).toContain('Packing tape');

    const byPart = render({ search: 'fb-50' });
    expect(byPart).toContain('FB-50');
    expect(byPart).not.toContain('Packing tape');
  });

  it('offers Receive only to someone holding the receive right', () => {
    expect(render()).toContain('Receive');
    expect(render({ canReceive: false })).not.toContain('Receive<');
  });

  it('says so when nothing is owed', () => {
    expect(render({ items: [finished] })).toContain('Nothing is owed on any open order');
  });
});
