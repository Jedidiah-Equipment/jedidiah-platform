// @vitest-environment jsdom

import { SupplierInvoiceReview } from '@pkg/schema/equipment';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const invoice = SupplierInvoiceReview.parse({
  documentId: '00000000-0000-4000-8000-000000000001',
  extractedAt: '2026-09-01T00:00:00.000Z',
  filename: 'invoice.pdf',
  invoiceDate: null,
  invoiceNumber: null,
  jobCodes: [],
  readable: true,
  resolutions: {},
  rows: [
    {
      correction: null,
      description: 'Office chair',
      flags: [{ key: 'price-mismatch:00000000-0000-4000-8000-000000000002', kind: 'price-mismatch' }],
      invoiceQuantity: 2,
      invoiceUnitPrice: 950,
      lineId: '00000000-0000-4000-8000-000000000002',
      matchMethod: 'description',
      orderedQuantity: 2,
      partCode: null,
      partId: null,
      partName: null,
      unitPrice: 900,
    },
  ],
  uploaderName: null,
});

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { items: [invoice] } }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    purchaseOrders: {
      supplierInvoices: { queryOptions: () => ({}) },
      applyInvoicePrice: { mutationOptions: () => ({}) },
      dismissInvoiceFlag: { mutationOptions: () => ({}) },
    },
  }),
}));
vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({
    invalidateInventory: vi.fn(),
    invalidatePurchaseOrders: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

import { PurchaseOrderInvoiceCrossCheckCard } from './PurchaseOrderInvoiceCrossCheckCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

it('offers Dismiss but no stock revaluation for a Custom Line price disagreement', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <PurchaseOrderInvoiceCrossCheckCard
        canApplyPrices
        canFileInvoice={false}
        purchaseOrderId="00000000-0000-4000-8000-000000000003"
      />,
    ),
  );
  expect(container.textContent).toContain('Office chair');
  expect(container.textContent).toContain('Custom');
  expect(container.textContent).toContain('Custom lines are not stock');
  expect(container.textContent).toContain('Dismiss price differs');
  expect(container.textContent).not.toContain('Apply — average');
  await act(async () => root.unmount());
});
