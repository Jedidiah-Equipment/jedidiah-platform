// @vitest-environment jsdom

import type { SupplierInvoiceReview, UUID } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const showMutationError = vi.fn();
/** What the server answers a flag a second pair of hands has already judged. */
const refusal = Object.assign(new Error('This flag has already been resolved.'), {
  data: { appCode: 'invoice.flag_already_resolved', code: 'CONFLICT' },
});

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => showMutationError }));
vi.mock('@/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateInventory: vi.fn(), invalidatePurchaseOrders: vi.fn() }),
}));
vi.mock('./PurchaseOrderSupplierInvoiceDialog.js', () => ({ PurchaseOrderSupplierInvoiceDialog: () => null }));
vi.mock('@/lib/trpc.js', () => {
  const refusingMutationOptions = (options: Record<string, unknown>) => ({
    ...options,
    mutationFn: () => Promise.reject(refusal),
  });

  return {
    useTRPC: () => ({
      purchaseOrders: {
        applyInvoicePrice: { mutationOptions: refusingMutationOptions },
        dismissInvoiceFlag: { mutationOptions: refusingMutationOptions },
      },
    }),
  };
});

import { SupplierInvoicePanel } from './PurchaseOrderInvoiceCrossCheckCard.js';

const PURCHASE_ORDER_ID = '00000000-0000-4000-8000-000000000001' as UUID;
const PART_ID = '00000000-0000-4000-8000-000000000002' as UUID;

/** One line the Supplier billed above the agreed price, with the revaluation still open. */
const invoice = {
  documentId: '00000000-0000-4000-8000-000000000003',
  filename: 'invoice.pdf',
  invoiceDate: null,
  invoiceNumber: null,
  jobCodes: [],
  readable: true,
  resolutions: {},
  rows: [
    {
      correction: { canApply: true, newAverageUnitCost: 120 },
      description: 'W96/161/205 Rim',
      flags: [{ key: 'price-mismatch:ATR-0021', kind: 'price-mismatch' }],
      invoiceQuantity: 2,
      invoiceUnitPrice: 130,
      matchMethod: 'part-code',
      orderedQuantity: 2,
      partCode: 'ATR-0021',
      partId: PART_ID,
      partName: 'Rim',
      unitPrice: 110,
    },
  ],
} as unknown as SupplierInvoiceReview;

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

/** Both buttons fire and forget through `mutate`, so nothing downstream can catch the refusal. */
const FLAG_ACTIONS = [
  { failureMessage: 'Unable to confirm this price.', label: 'Apply' },
  { failureMessage: 'Unable to dismiss this flag.', label: 'Dismiss' },
] as const;

describe('SupplierInvoicePanel', () => {
  it.each(FLAG_ACTIONS)('$label reports a refusal instead of leaving the click looking ignored', async ({
    failureMessage,
    label,
  }) => {
    const container = await mount();

    await click(container, label);

    await vi.waitFor(() => {
      expect(showMutationError).toHaveBeenCalledWith(refusal, failureMessage);
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
        <SupplierInvoicePanel canApplyPrices invoice={invoice} purchaseOrderId={PURCHASE_ORDER_ID} />
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
