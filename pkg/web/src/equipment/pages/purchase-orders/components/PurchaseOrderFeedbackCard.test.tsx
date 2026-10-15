// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { ClientConfig } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TRPCProvider } from '@/lib/trpc.js';
import { PurchaseOrderFeedbackCard } from './PurchaseOrderFeedbackCard.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('renders the newest-first PO timeline with attribution and no Job links or status controls', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.__APP_CONFIG__ = ClientConfig.parse({
    appBaseUrl: 'http://localhost:7001',
    appEnv: 'development',
    apiBaseUrl: 'http://localhost:7002',
    authBaseUrl: 'http://localhost:7002/api/auth',
    docsBaseUrl: 'https://help.example.com',
  });
  const purchaseOrderId = '00000000-0000-4000-8000-000000000042';
  const submitter = { id: 'author', name: 'Alex Smith', email: 'alex@example.com', thumbnailDataUrl: null };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://feedback.test/trpc',
        fetch: async (url) => {
          expect(new URL(String(url)).pathname).toBe('/trpc/feedback.listPurchaseOrderFeedback');
          return Response.json({
            result: {
              data: {
                items: [
                  {
                    id: '00000000-0000-4000-8000-000000000002',
                    createdAt: '2026-10-14T10:00:00.000Z',
                    text: 'Newest delivery update',
                    submitter,
                  },
                  {
                    id: '00000000-0000-4000-8000-000000000001',
                    createdAt: '2026-10-13T10:00:00.000Z',
                    text: 'Earlier delivery update',
                    submitter,
                  },
                ],
              },
            },
          });
        },
      }),
    ],
  });
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient: client });
  await client.prefetchQuery(trpc.feedback.listPurchaseOrderFeedback.queryOptions({ purchaseOrderId }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <TRPCProvider queryClient={client} trpcClient={trpcClient}>
            <PurchaseOrderFeedbackCard code="PO-00042" purchaseOrderId={purchaseOrderId} />
          </TRPCProvider>
        </QueryClientProvider>,
      ),
    );
    expect(container.textContent).toContain('Earlier delivery update');
    const content = container.textContent ?? '';
    expect(content.indexOf('Newest delivery update')).toBeLessThan(content.indexOf('Earlier delivery update'));
    expect(container.querySelectorAll('[aria-label="Alex Smith"]')).toHaveLength(2);
    expect(container.querySelectorAll('a[href*="/jobs"]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="Help with Purchase Order Feedback"]')?.getAttribute('href')).toBe(
      'https://help.example.com/inventory/send-feedback-on-a-purchase-order',
    );
    expect([...container.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Send Feedback']);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    delete window.__APP_CONFIG__;
    vi.unstubAllGlobals();
  }
});
