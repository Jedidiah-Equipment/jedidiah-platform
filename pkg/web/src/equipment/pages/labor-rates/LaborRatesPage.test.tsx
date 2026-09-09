// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import { type LaborRateCard, LaborRateCardUpdateInput, WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { LaborRatesPage } from './LaborRatesPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('refreshes a previously saved form from the card without replacing unsaved edits', async () => {
  let savedCard: LaborRateCard = {
    hoursPerWorkingDay: 9,
    managementOverheadPercentage: 50,
    rates: WORK_ITEM_DEPARTMENTS.map((department) => ({
      department,
      billingRate: 550,
      costToCompanyRate: 220,
      consumablesPercentage: 60,
    })),
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://labor-rates.test/trpc',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          if (path === 'auth.access')
            return Response.json({
              result: {
                data: createUserAccessSummary({ equipmentRole: 'admin', contractingRole: null, userId: 'admin' }),
              },
            });
          if (path === 'laborRates.update') savedCard = LaborRateCardUpdateInput.parse(JSON.parse(String(init?.body)));
          else if (path !== 'laborRates.get') throw new Error(`Unexpected request ${path}`);
          return Response.json({ result: { data: savedCard } });
        },
      }),
    ],
  });
  const trpc = createTrpcOptions(queryClient, trpcClient);
  await queryClient.fetchQuery(trpc.auth.access.queryOptions());
  await queryClient.fetchQuery(trpc.laborRates.get.queryOptions());
  const router = createRouter({
    routeTree: createRootRoute({ component: LaborRatesPage }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const field = (name: string) => {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`Missing input ${name}`);
    return input;
  };
  const edit = async (name: string, value: string) => {
    await act(async () => {
      const input = field(name);
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
  };
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
    await edit('fabrication.billingRate', '600');
    await edit('hoursPerWorkingDay', '8');
    await edit('managementOverheadPercentage', '55');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
    });
    expect(container.textContent).toContain('Labor rates saved.');
    savedCard = {
      ...savedCard,
      hoursPerWorkingDay: 10,
      managementOverheadPercentage: 70,
      rates: savedCard.rates.map((rate) => ({ ...rate, billingRate: 700 })),
    };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.laborRates.pathKey() });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(field('fabrication.billingRate').value).toBe('700');
    expect(field('hoursPerWorkingDay').value).toBe('10');
    expect(field('managementOverheadPercentage').value).toBe('70');
    await edit('fabrication.billingRate', '725');
    savedCard = { ...savedCard, rates: savedCard.rates.map((rate) => ({ ...rate, billingRate: 800 })) };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.laborRates.pathKey() });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(field('fabrication.billingRate').value).toBe('725');
  } finally {
    await act(async () => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    scroll.mockRestore();
  }
});
