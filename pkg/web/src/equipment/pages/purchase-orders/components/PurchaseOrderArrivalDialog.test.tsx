// @vitest-environment jsdom

import type { PurchaseOrderLineView, PurchaseOrderView } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const posted = vi.hoisted(() => vi.fn(async () => ({ arrival: {}, warnings: [] })));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ purchaseOrders: { postArrival: { mutationOptions: () => ({ mutationFn: posted }) } } }),
}));
vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidatePurchaseOrders: async () => {} }),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

import { PurchaseOrderArrivalDialog } from './PurchaseOrderArrivalDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.length = 0;
  document.body.replaceChildren();
  posted.mockClear();
});

const line = {
  description: 'Packing tape',
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'custom',
  quantity: 2.5,
  receivedQuantity: 1,
} as PurchaseOrderLineView;
const purchaseOrder = { id: '00000000-0000-4000-8000-000000000002' } as PurchaseOrderView;

async function mount(reverse: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PurchaseOrderArrivalDialog
          line={line}
          onOpenChange={vi.fn()}
          purchaseOrder={purchaseOrder}
          reverse={reverse}
        />
      </QueryClientProvider>,
    ),
  );
}

async function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('previews the over-arrival warning before posting', async () => {
  await mount(false);
  const quantity = document.querySelector<HTMLInputElement>('input[name="quantity"]');
  if (!quantity) throw new Error('Quantity input missing');
  await change(quantity, '2');
  expect(document.body.textContent).toContain('This receipt takes the line past the quantity ordered.');
  expect(document.body.textContent).toContain('Receive it anyway');
});

it('requires a reversal note and caps the keyed quantity', async () => {
  await mount(true);
  const button = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === 'Reverse arrival',
  );
  if (!button) throw new Error('Reverse action missing');
  expect(button.disabled).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[name="quantity"]')?.max).toBe('1');
  const note = document.querySelector<HTMLTextAreaElement>('textarea[name="note"]');
  if (!note) throw new Error('Note input missing');
  await change(note, 'Wrong count');
  expect(button.disabled).toBe(false);
});
