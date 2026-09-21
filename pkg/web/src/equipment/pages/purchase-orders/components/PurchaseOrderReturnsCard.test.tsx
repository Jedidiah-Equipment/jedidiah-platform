// @vitest-environment jsdom

import type { PurchaseOrderView } from '@pkg/schema/equipment';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { items: [] } }),
}));
vi.mock('@/lib/trpc.js', () => ({ useTRPC: () => ({ purchaseOrders: { returns: { queryOptions: () => ({}) } } }) }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
vi.mock('./PurchaseOrderReturnDialog.js', () => ({
  PurchaseOrderReturnDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <button onClick={() => onOpenChange(false)} type="button">
      Close return
    </button>
  ),
}));

import { PurchaseOrderReturnsCard } from './PurchaseOrderReturnsCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

it('opens a Part return only when selected, then stays closed beside a Custom Line', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const purchaseOrder = {
    id: '00000000-0000-4000-8000-000000000001',
    lines: [
      { id: '00000000-0000-4000-8000-000000000002', kind: 'custom', partId: null, receivedQuantity: 0 },
      {
        id: '00000000-0000-4000-8000-000000000003',
        kind: 'part',
        partCode: 'P-100',
        partId: '00000000-0000-4000-8000-000000000004',
        receivedQuantity: 1,
      },
    ],
  } as PurchaseOrderView;

  await act(async () =>
    root.render(
      <PurchaseOrderReturnsCard
        canFileCreditNote={false}
        canReadCosts={false}
        canReturn
        purchaseOrder={purchaseOrder}
      />,
    ),
  );
  expect(container.textContent).not.toContain('Close return');
  const returnButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Return P-100'),
  );
  if (!returnButton) throw new Error('Part return action missing');
  await act(async () => returnButton.click());
  expect(container.textContent).toContain('Close return');

  const closeButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Close return'),
  );
  if (!closeButton) throw new Error('Return dialog close action missing');
  await act(async () => closeButton.click());
  expect(container.textContent).not.toContain('Close return');
  await act(async () => root.unmount());
});
