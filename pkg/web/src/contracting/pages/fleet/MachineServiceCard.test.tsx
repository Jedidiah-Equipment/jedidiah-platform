// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { buildMachine, buildServiceRecord } from '@/contracting/test/fleet-fixtures.js';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { MachineServiceCard } from './MachineServiceCard.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/components/help/index.js', () => ({ HelpLink: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('an open record reads as a Booked in since line linking to its page, with no form', async () => {
  const machine = buildMachine({ bookedInServiceId: '00000000-0000-4000-8000-0000000000aa' });
  const record = buildServiceRecord({
    machineId: machine.id,
    primaryMechanicUserId: 'thabo',
    mechanicName: 'Thabo Nkosi',
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://fleet.test/trpc',
        fetch: async (input) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          const data = (() => {
            switch (path) {
              case 'auth.access':
                return createUserAccessSummary({
                  equipmentRole: null,
                  contractingRole: 'workshop-manager',
                  userId: 'connor',
                });
              case 'contractingServices.list':
                return { items: [record], nextCursor: null, total: 1 };
              case 'contractingServices.options.mechanics':
                return [];
              default:
                throw new Error(`Unexpected request ${path}`);
            }
          })();
          return Response.json({ result: { data } });
        },
      }),
    ],
  });
  await queryClient.fetchQuery(createTrpcOptions(queryClient, trpcClient).auth.access.queryOptions());
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <MachineServiceCard machine={machine}>
          <span>Machine service settings</span>
        </MachineServiceCard>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <RouterProvider router={router} />
        </TRPCProvider>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await vi.waitFor(() => expect(container.textContent).toContain('Booked in since 20 Oct 2026 · Thabo'));
  });

  const link = [...container.querySelectorAll('a')].find((each) => each.textContent === 'Open service');
  expect(link?.getAttribute('href')).toBe(`/contracting/services/${record.id}`);
  expect(container.textContent).toContain('Machine service settings');
  expect(container.querySelector('textarea')).toBeNull();
  await act(async () => root.unmount());
});
