// @vitest-environment jsdom

import type { PurchaseOrderView } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const showMutationError = vi.fn();
/** What the server answers a draft whose line still carries the not-priced-yet zero. */
const refusal = Object.assign(new Error('Set a unit price for ATR-0021 before sending this Purchase Order.'), {
  data: { appCode: 'purchase_order.line_not_priced', code: 'BAD_REQUEST' },
});

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => showMutationError }));
vi.mock('@/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: vi.fn(), invalidatePurchaseOrders: vi.fn() }),
}));
vi.mock('@/lib/trpc.js', () => {
  const refusingMutationOptions = (options: Record<string, unknown>) => ({
    ...options,
    mutationFn: () => Promise.reject(refusal),
  });

  return {
    useTRPC: () => ({
      purchaseOrders: {
        cancel: { mutationOptions: refusingMutationOptions },
        closeShort: { mutationOptions: refusingMutationOptions },
        markSent: { mutationOptions: refusingMutationOptions },
      },
    }),
  };
});

import { PurchaseOrderActions } from './PurchaseOrderDetailPage.js';

const purchaseOrder = {
  code: 'PO-00024',
  documentId: null,
  id: '00000000-0000-4000-8000-000000000024',
} as unknown as PurchaseOrderView;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
const mountedContainers: HTMLDivElement[] = [];

afterEach(() => {
  for (const root of mountedRoots) act(() => root.unmount());
  mountedRoots.length = 0;
  for (const container of mountedContainers) container.remove();
  mountedContainers.length = 0;
  showMutationError.mockClear();
});

describe('PurchaseOrderActions', () => {
  it('reports a refused Mark sent instead of leaving the click looking ignored', async () => {
    const container = await mount();

    await click(container, 'Mark sent');

    await vi.waitFor(() => {
      expect(showMutationError).toHaveBeenCalledWith(refusal, 'Unable to mark this Purchase Order sent.');
    });
  });
});

async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PurchaseOrderActions
          canCancel={false}
          canCloseShort={false}
          canEdit={false}
          canReadCosts={false}
          canSend
          isPending={false}
          purchaseOrder={purchaseOrder}
          // The page flushes the draft first; every failure this test cares about is the action's own.
          runAfterSave={async (action) => {
            await action();
            return true;
          }}
        />
      </QueryClientProvider>,
    );
  });

  return container;
}

async function click(container: HTMLDivElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`No ${label} button rendered`);

  await act(async () => {
    button.click();
  });
}
