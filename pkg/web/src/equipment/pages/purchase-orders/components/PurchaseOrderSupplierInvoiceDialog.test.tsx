// @vitest-environment jsdom

import type { PurchaseOrderReturnRow } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateInventory: async () => {}, invalidatePurchaseOrders: async () => {} }),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

import { PurchaseOrderCreditNoteDialog } from './PurchaseOrderCreditNoteDialog.js';
import { PurchaseOrderSupplierInvoiceDialog } from './PurchaseOrderSupplierInvoiceDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const request = vi.fn(() => new Promise<Response>(() => {}));

beforeEach(async () => {
  window.__APP_CONFIG__ = {
    appEnv: 'development',
    appBaseUrl: 'http://localhost:7201',
    apiBaseUrl: 'http://localhost:7202',
    authBaseUrl: 'http://localhost:7202/api/auth',
    docsBaseUrl: null,
    deploymentVersion: null,
    posthog: { enabled: false, apiHost: '/info', uiHost: 'https://us.posthog.com', release: null },
  };
  vi.stubGlobal('fetch', request);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PurchaseOrderSupplierInvoiceDialog
          onOpenChange={vi.fn()}
          purchaseOrderId="00000000-0000-4000-8000-000000000001"
        />
      </QueryClientProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  request.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const item = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === label || element.textContent?.trim() === label,
  );
  if (!item) throw new Error(`Missing action: ${label}`);
  return item;
}

async function select(file?: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing file input');
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('shows missing and invalid PDF errors without starting a request', async () => {
  expect(button('File invoice').disabled).toBe(false);
  await act(async () => button('File invoice').click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Choose a Supplier invoice');
  await select(new File(['%PDF'], 'previous.pdf', { type: 'application/pdf' }));
  await select(new File(['image'], 'wrong.png', { type: 'image/png' }));
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Only PDF documents');
  await act(async () => button('File invoice').click());
  expect(request).not.toHaveBeenCalled();
});

it('keeps a draft through preview/cancel, replaces and removes it locally, and submits only once', async () => {
  const first = new File(['%PDF-first'], 'first.pdf', { type: 'application/pdf' });
  const replacement = new File(['%PDF-replacement'], 'replacement.pdf', { type: 'application/pdf' });
  await select(first);
  await act(async () => button('Enlarge invoice pdf').click());
  expect(document.querySelector('iframe')?.title).toBe('first.pdf');
  expect(request).not.toHaveBeenCalled();
  await act(async () => button('Close').click());
  await select();
  expect(document.body.textContent).toContain('first.pdf');
  await select(replacement);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.pdf');
  await act(async () => button('Remove invoice pdf').click());
  await act(async () => button('File invoice').click());
  expect(request).not.toHaveBeenCalled();
  await select(replacement);
  await act(async () => button('File invoice').click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  await act(async () => button('Reading invoice...').click());
  expect(request).toHaveBeenCalledOnce();
  const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('/supplier-invoices');
  expect(options.credentials).toBe('include');
  expect((options.body as FormData).get('file')).toBe(replacement);
  expect(document.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(true);
});

it('requires credit note returns and submits only the checked settlement IDs', async () => {
  const returnedId = '00000000-0000-4000-8000-000000000002';
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PurchaseOrderCreditNoteDialog
          onOpenChange={vi.fn()}
          purchaseOrderId="00000000-0000-4000-8000-000000000001"
          returns={[
            {
              id: returnedId,
              partCode: 'P1',
              quantity: 2,
              reason: 'defective',
              createdAt: '2026-09-30T10:00:00.000Z',
            } as PurchaseOrderReturnRow,
          ]}
        />
      </QueryClientProvider>,
    ),
  );
  const file = new File(['%PDF-credit'], 'credit.pdf', { type: 'application/pdf' });
  await select(file);
  await act(async () => button('File credit note').click());
  expect(document.body.textContent).toContain('Choose at least one return');
  expect(request).not.toHaveBeenCalled();
  await act(async () => document.querySelector<HTMLButtonElement>('[role=checkbox]')?.click());
  await select(new File(['image'], 'replacement.png', { type: 'image/png' }));
  await act(async () => button('File credit note').click());
  expect(request).not.toHaveBeenCalled();
  await select(file);
  await act(async () => button('File credit note').click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  expect(request).toHaveBeenCalledOnce();
  const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('/credit-notes');
  expect((options.body as FormData).get('stockMovementIds')).toBe(JSON.stringify([returnedId]));
  expect((options.body as FormData).get('file')).toBe(file);
  expect(document.querySelector('[role=checkbox]')?.getAttribute('aria-disabled')).toBe('true');
});
