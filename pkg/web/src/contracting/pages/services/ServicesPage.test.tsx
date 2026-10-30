// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import type { ServiceRecordListInput } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { buildMachine, buildServiceRecord } from '@/contracting/test/fleet-fixtures.js';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { ServicesPage } from './ServicesPage.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machine = buildMachine();
const record = buildServiceRecord();

afterEach(() => {
  document.body.replaceChildren();
  window.localStorage.clear();
});

async function mount(due = machine) {
  const tableInputs: ServiceRecordListInput[] = [];
  const opened: unknown[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://services.test/trpc',
        fetch: async (input, init) => {
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
              case 'contractingServices.list':
                tableInputs.push(JSON.parse(url.searchParams.get('input') ?? '{}'));
                return { items: [record], nextCursor: null, total: 1 };
              case 'contractingFleet.machines.list':
                return [due];
              case 'contractingServices.options.filters':
                return { machines: [], mechanics: [] };
              case 'contractingServices.options.mechanics':
                return [];
              case 'contractingServices.open':
                opened.push(JSON.parse(String(init?.body)));
                return { ...record, machineId: machine.id };
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
  const rows = () => [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  const button = (name: string) => {
    const found = [...container.querySelectorAll('button')].find((each) => each.textContent?.trim().startsWith(name));
    if (!found) throw new Error(`Missing button ${name}`);
    return found;
  };
  const labelled = (label: string) => container.querySelector(`[aria-label="${label}"]`);
  return { container, rows, button, labelled, tableInputs, opened, root, router };
}

test('pins the Machines Due for Service above every Service Record, painted, booking that Machine in from its row', async () => {
  const { rows, opened, router } = await mount();

  const [pinned, booked] = rows();
  expect(pinned?.textContent).toContain('KOL220-2');
  expect(pinned?.textContent).toContain('Service overdue');
  expect(pinned?.textContent).toContain('Overdue by 12.5 h');
  expect(pinned?.className).toContain('--warning-surface');
  expect(booked?.textContent).toContain('JD110-1');
  expect(booked?.textContent).toContain('Booked in');
  expect(booked?.className).not.toContain('--warning-surface');

  await act(async () => pinned?.querySelector('button')?.click());
  expect(document.body.textContent).toContain('Book the Machine in.');
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Search machines');
  const submit = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
    (each) => each.textContent?.trim() === 'Book service',
  );
  await act(async () => submit?.click());
  await act(async () => {
    await vi.waitFor(() => expect(opened).toMatchObject([{ machineId: machine.id }]));
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(router.state.location).toMatchObject({ pathname: `/contracting/services/${record.id}` }),
    );
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('shows the John Deere mark on a Machine whose latest reading its telematics reported', async () => {
  const { rows } = await mount({ ...machine, latestReadingProvider: 'john-deere' });

  const [pinned, booked] = rows();
  expect(pinned?.textContent).toContain('John Deere');
  expect(booked?.textContent).not.toContain('John Deere');
});

test('books a service from the page header, picking the Machine in the dialog', async () => {
  const { button } = await mount();

  await act(async () => button('Book a service').click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain('Machine');
  expect(dialog?.querySelector('#machineId')).not.toBeNull();
});

test('offers the Machine, Mechanic and Status column filters and the Start sort', async () => {
  const { labelled } = await mount();

  for (const label of ['Filter Machine', 'Filter Mechanic', 'Filter Status', 'Sort Start'])
    expect(labelled(label), label).not.toBeNull();
});

test('shows only Booked In Service Records until the Status filter asks for more, with no quick filters', async () => {
  const { rows, tableInputs, labelled } = await mount();

  expect(tableInputs.at(-1)?.statuses).toEqual(['open']);
  expect(labelled('Service Record statuses')).toBeNull();
  expect(rows()[0]?.textContent).toContain('KOL220-2');
});

test('opens a Service Record row on its page', async () => {
  const { rows, router } = await mount();

  expect(rows()[1]?.getAttribute('aria-label')).toBe('Open the service on Machine JD110-1');
  await act(async () => rows()[1]?.click());
  await act(async () => {
    await vi.waitFor(() =>
      expect(router.state.location).toMatchObject({ pathname: `/contracting/services/${record.id}` }),
    );
  });
});

test('opens a pinned Due for Service row on its Machine', async () => {
  const { rows, router } = await mount();

  expect(rows()[0]?.getAttribute('aria-label')).toBe('Open the Machine KOL220-2');
  await act(async () => rows()[0]?.click());
  await act(async () => {
    await vi.waitFor(() =>
      expect(router.state.location).toMatchObject({ pathname: `/contracting/fleet/${machine.id}/edit` }),
    );
  });
});
