// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import { DateIso } from '@pkg/schema';
import type { PartCategory } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { PartCategoriesPage } from './PartCategoriesPage.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function category(name: string, markupPercent: number | null): PartCategory {
  const now = DateIso.parse('2026-09-22T00:00:00.000Z');
  return { createdAt: now, id: crypto.randomUUID(), markupPercent, name, partCount: 0, updatedAt: now };
}

test('shows each markup, marks the missing ones Not set, and sorts them last', async () => {
  const categories = [category('Axle', null), category('Bolt & Nuts', 25), category('Pipe', 0)];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://part-categories.test/trpc',
        fetch: async (input) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          if (path === 'auth.access')
            return Response.json({
              result: {
                data: createUserAccessSummary({ equipmentRole: 'admin', contractingRole: null, userId: 'admin' }),
              },
            });
          if (path !== 'partCategories.list') throw new Error(`Unexpected request ${path}`);
          return Response.json({ result: { data: categories } });
        },
      }),
    ],
  });
  const trpc = createTrpcOptions(queryClient, trpcClient);
  await queryClient.fetchQuery(trpc.auth.access.queryOptions());
  await queryClient.fetchQuery(trpc.partCategories.list.queryOptions());
  const router = createRouter({
    routeTree: createRootRoute({ component: PartCategoriesPage }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const markups = () => Array.from(container.querySelectorAll('tbody tr'), (row) => row.children[1]?.textContent);
  try {
    await act(async () => {
      await router.load();
      root.render(
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            <RouterProvider router={router} />
          </TRPCProvider>
        </QueryClientProvider>,
      );
    });
    expect(markups()).toEqual(['Not set', '25%', '0%']);

    const sortByMarkup = () =>
      act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="Sort Markup"]')?.click();
      });
    await sortByMarkup();
    expect(markups()).toEqual(['0%', '25%', 'Not set']);
    await sortByMarkup();
    expect(markups()).toEqual(['25%', '0%', 'Not set']);
  } finally {
    await act(async () => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    scroll.mockRestore();
  }
});
