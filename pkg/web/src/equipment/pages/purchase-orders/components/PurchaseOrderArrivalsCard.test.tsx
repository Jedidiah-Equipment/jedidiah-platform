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
  PurchaseOrderArrivalDialog: ({ reverse }: { reverse: boolean }) => <p>{reverse ? 'Reversing' : 'Receiving'}</p>,
}));

import { PurchaseOrderArrivalsCard } from './PurchaseOrderArrivalsCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINE_ID = '00000000-0000-4000-8000-000000000002';
const purchaseOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  lines: [{ description: 'Packing tape', id: LINE_ID, kind: 'custom', receivedQuantity: 2 }],
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
  expect(readOnly.textContent).not.toContain('Reverse Packing tape');

  const container = await render(true);
  const reverse = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Reverse Packing tape'),
  );
  if (!reverse) throw new Error('Reverse action missing');
  await act(async () => reverse.click());
  expect(container.textContent).toContain('Reversing');
});
