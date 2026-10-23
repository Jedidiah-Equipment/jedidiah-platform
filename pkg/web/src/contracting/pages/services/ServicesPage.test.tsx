// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import type { Machine, ServiceRecord, ServiceRecordTableInput } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { ServicesPage } from './ServicesPage.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machine = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'KOL220-2',
  make: 'Kobelco',
  model: '220',
  categoryId: '00000000-0000-4000-8000-0000000000c1',
  categoryName: 'Excavator',
  categoryIcon: 'excavator',
  categoryColour: 'amber',
  year: null,
  registration: null,
  currentDriverUserId: null,
  currentDriverName: null,
  notes: null,
  serviceIntervalHours: null,
  nextServiceDueHours: 4850,
  latestReadingHours: 4862.5,
  latestReadingAt: '2026-10-21T08:00:00.000Z',
  hoursToService: -12.5,
  serviceDueStatus: 'overdue',
  serviceBookedIn: false,
  busyOnJob: null,
  retiredAt: null,
  retiredReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Machine;

const record = {
  id: '00000000-0000-4000-8000-0000000000r1',
  machineId: '00000000-0000-4000-8000-000000000002',
  machineCode: 'JD110-1',
  categoryName: 'Tractor',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
  startDate: '2026-10-20',
  endDate: null,
  readingAtServiceHours: null,
  primaryMechanicUserId: null,
  mechanicName: 'Mo Mechanic',
  notes: 'Oil and filters',
  nextServiceDueHoursSet: null,
  status: 'open',
  closedAt: null,
  closedByName: null,
  createdAt: '2026-10-20T08:00:00.000Z',
  updatedAt: '2026-10-20T08:00:00.000Z',
} as unknown as ServiceRecord;

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

async function mount() {
  const tableInputs: ServiceRecordTableInput[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://services.test/trpc',
        fetch: async (input) => {
          const url = new URL(String(input));
          const path = url.pathname.slice('/trpc/'.length);
          const data = (() => {
            switch (path) {
              case 'auth.access':
                return createUserAccessSummary({
                  equipmentRole: null,
                  contractingRole: 'workshop-manager',
                  userId: 'connor',
                });
              case 'contractingServices.table':
                tableInputs.push(JSON.parse(url.searchParams.get('input') ?? '{}'));
                return { items: [record], nextCursor: null, total: 1 };
              case 'contractingServices.summary':
                return { counts: { open: 1, closed: 4 } };
              case 'contractingServices.dueForService':
                return [machine];
              case 'contractingServices.options.filters':
                return { machines: [], mechanics: [] };
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
  const trpc = createTrpcOptions(queryClient, trpcClient);
  await queryClient.fetchQuery(trpc.auth.access.queryOptions());
  const router = createRouter({
    routeTree: createRootRoute({ component: ServicesPage }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
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
    await vi.waitFor(() => expect(container.textContent).toContain('JD110-1'));
  });
  const rows = () => [...container.querySelectorAll('tbody tr')];
  const button = (name: string) => {
    const found = [...container.querySelectorAll('button')].find((each) => each.textContent?.trim().startsWith(name));
    if (!found) throw new Error(`Missing button ${name}`);
    return found;
  };
  return { container, rows, button, tableInputs, root };
}

test('pins the Machines Due for Service above every Service Record, painted, with Record a service on the row', async () => {
  const { rows, button } = await mount();

  const [pinned, booked] = rows();
  expect(pinned?.textContent).toContain('KOL220-2');
  expect(pinned?.textContent).toContain('Service overdue');
  expect(pinned?.textContent).toContain('Overdue by 12.5 h');
  expect(pinned?.className).toContain('--warning-surface');
  expect(booked?.textContent).toContain('JD110-1');
  expect(booked?.textContent).toContain('Booked in');
  expect(booked?.className).not.toContain('--warning-surface');

  await act(async () => button('Record a service').click());
  expect(document.body.textContent).toContain('Book the Machine in.');
});

test('a status quick filter narrows the Service Records and never the pinned Machines', async () => {
  const { rows, button, tableInputs } = await mount();

  await act(async () => button('Closed').click());
  await act(async () => {
    await vi.waitFor(() => expect(tableInputs.at(-1)?.statuses).toEqual(['closed']));
  });
  expect(rows()[0]?.textContent).toContain('KOL220-2');
});
