// @vitest-environment jsdom

import { PurchaseOrderArrival, type PurchaseOrderView } from '@pkg/schema/equipment';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const arrivals = vi.hoisted(() => ({ items: [] as PurchaseOrderArrival[] }));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { items: arrivals.items } }),
}));
vi.mock('@/lib/trpc.js', () => ({ useTRPC: () => ({ purchaseOrders: { arrivals: { queryOptions: () => ({}) } } }) }));
vi.mock('./PurchaseOrderArrivalDialog.js', () => ({
  PurchaseOrderArrivalDialog: ({ line, reverse }: { line: { id: string }; reverse: boolean }) => (
    <p>{`${reverse ? 'Reversing' : 'Receiving'} ${line.id}`}</p>
  ),
}));

import { PurchaseOrderArrivalsCard } from './PurchaseOrderArrivalsCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINE_ID = '00000000-0000-4000-8000-000000000002';
const TWIN_LINE_ID = '00000000-0000-4000-8000-000000000004';
const customLine = {
  description: 'Packing tape',
  hasStockMovements: true,
  kind: 'custom',
  supplierCode: null,
  unit: 'box',
};
// Descriptions may repeat on one order; only the quantities tell these two apart.
const purchaseOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  lines: [
    { ...customLine, id: LINE_ID, quantity: 5, receivedQuantity: 2 },
    { ...customLine, id: TWIN_LINE_ID, quantity: 9, receivedQuantity: 3 },
  ],
} as PurchaseOrderView;
const arrival = PurchaseOrderArrival.parse({
  actorName: 'Jordan',
  actorUserId: 'user-1',
  createdAt: '2026-09-01T08:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000003',
  lineDescription: 'Packing tape',
  lineId: LINE_ID,
  note: null,
  quantity: 2,
});

async function render(canReverse: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<PurchaseOrderArrivalsCard canReverse={canReverse} purchaseOrder={purchaseOrder} />),
  );

  return container;
}

afterEach(() => {
  arrivals.items = [];
  document.body.replaceChildren();
});

it('stays off the page until something has arrived', async () => {
  expect((await render(true)).textContent).toBe('');
});

it('lists Arrivals for every reader, and offers the reversal only to one who may post it', async () => {
  arrivals.items = [arrival];

  const readOnly = await render(false);
  expect(readOnly.textContent).toContain('Packing tape');
  expect(readOnly.textContent).not.toContain('Reverse arrival');
});

it('reverses the line whose row was clicked when two lines share a description', async () => {
  arrivals.items = [arrival];

  const container = await render(true);
  expect(container.textContent).toContain('2 / 5 box');
  expect(container.textContent).toContain('3 / 9 box');
  const twinRow = [...container.querySelectorAll('tr')].find((row) => row.textContent?.includes('3 / 9 box'));
  const reverse = twinRow?.querySelector('button');
  if (!reverse) throw new Error('Reverse action missing from the second line');
  await act(async () => reverse.click());

  expect(container.textContent).toContain(`Reversing ${TWIN_LINE_ID}`);
});
