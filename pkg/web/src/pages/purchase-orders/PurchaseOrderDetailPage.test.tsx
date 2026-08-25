// @vitest-environment jsdom

import type { PurchaseOrderView } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const showMutationError = vi.fn();
const access = vi.hoisted(() => ({ canReadAudit: true }));
/** What the server answers a draft whose line still carries the not-priced-yet zero. */
const refusal = Object.assign(new Error('Set a unit price for ATR-0021 before sending this Purchase Order.'), {
  data: { appCode: 'purchase_order.line_not_priced', code: 'BAD_REQUEST' },
});

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => showMutationError }));
vi.mock('@/hooks/use-access.js', () => ({
  useAccess: vi.fn(),
  useCan: () => ({ can: access.canReadAudit }),
}));
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
        approve: { mutationOptions: refusingMutationOptions },
        documents: {
          queryOptions: (input: unknown) => ({
            queryFn: () => Promise.resolve({ items: [] }),
            queryKey: ['purchase-order-documents', input],
          }),
        },
        cancel: { mutationOptions: refusingMutationOptions },
        closeShort: { mutationOptions: refusingMutationOptions },
        markSent: { mutationOptions: refusingMutationOptions },
        revertToDraft: { mutationOptions: refusingMutationOptions },
      },
    }),
  };
});

import { PurchaseOrderActions, PurchaseOrderDetailTabs } from './PurchaseOrderDetailPage.js';

const purchaseOrder = {
  code: 'PO-00024',
  documentId: null,
  id: '00000000-0000-4000-8000-000000000024',
} as unknown as PurchaseOrderView;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
const mountedContainers: HTMLDivElement[] = [];

// Cancel, Close short and Revert to draft all ask before they post, and jsdom has no confirm to answer with.
vi.stubGlobal('confirm', () => true);

afterEach(() => {
  for (const root of mountedRoots) act(() => root.unmount());
  mountedRoots.length = 0;
  for (const container of mountedContainers) container.remove();
  mountedContainers.length = 0;
  access.canReadAudit = true;
  showMutationError.mockClear();
});

/** Every lifecycle button, and the message the buyer gets when the server refuses that one. */
const LIFECYCLE_ACTIONS = [
  { failureMessage: 'Unable to approve this Purchase Order.', label: 'Approve' },
  { failureMessage: 'Unable to revert this Purchase Order to draft.', label: 'Revert to draft' },
  { failureMessage: 'Unable to mark this Purchase Order sent.', label: 'Mark sent' },
  { failureMessage: 'Unable to cancel this Purchase Order.', label: 'Cancel' },
  { failureMessage: 'Unable to close this Purchase Order short.', label: 'Close short' },
] as const;

describe('PurchaseOrderActions', () => {
  it.each(LIFECYCLE_ACTIONS)(
    '$label reports a refusal instead of leaving the click looking ignored',
    async ({ failureMessage, label }) => {
      const container = await mount();

      await click(container, label);

      await vi.waitFor(() => {
        expect(showMutationError).toHaveBeenCalledWith(refusal, failureMessage);
      });
    },
  );
});

describe('PurchaseOrderDetailTabs', () => {
  it('keeps the audit tab hidden from readers without audit access', async () => {
    access.canReadAudit = false;
    const container = await mountNode(
      <PurchaseOrderDetailTabs purchaseOrderId={purchaseOrder.id}>
        <div>Current purchase order details</div>
      </PurchaseOrderDetailTabs>,
    );

    expect(container.textContent).toContain('Details');
    expect(container.textContent).toContain('Current purchase order details');
    expect(container.textContent).not.toContain('Audit');
  });
});

async function mount(): Promise<HTMLDivElement> {
  return mountNode(
    <QueryClientProvider client={new QueryClient()}>
      <PurchaseOrderActions
        canApprove
        canCancel
        canCloseShort
        canEdit={false}
        canReadCosts={false}
        canRevertToDraft
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
}

async function mountNode(node: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(node);
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
