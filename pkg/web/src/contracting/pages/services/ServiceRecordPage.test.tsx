// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import type { ServiceRecord } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { buildMachine, buildServiceRecord } from '@/contracting/test/fleet-fixtures.js';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { ServiceRecordPage } from './ServiceRecordPage.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machine = buildMachine({
  id: '00000000-0000-4000-8000-000000000002',
  code: 'JD110-1',
  serviceBookedIn: true,
  latestReadingProvider: 'john-deere',
});
const openRecord = buildServiceRecord({ primaryMechanicUserId: 'thabo', mechanicName: 'Thabo Nkosi' });
const closedRecord = buildServiceRecord({
  status: 'closed',
  endDate: '2026-10-22',
  readingAtServiceHours: 4862.5,
  nextServiceDueHoursSet: 5112.5,
  closedAt: '2026-10-22T10:00:00.000Z',
  closedByName: 'Sipho Dlamini',
});

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(record: ServiceRecord, { without = [] as AppPermission[] } = {}) {
  const patched: unknown[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://services.test/trpc',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          const data = (() => {
            switch (path) {
              case 'auth.access': {
                const access = createUserAccessSummary({
                  equipmentRole: null,
                  contractingRole: 'workshop-manager',
                  userId: 'connor',
                });
                return { ...access, permissions: access.permissions.filter((each) => !without.includes(each)) };
              }
              case 'contractingServices.get':
                return record;
              case 'contractingFleet.machines.get':
                return machine;
              case 'contractingServices.options.mechanics':
                return [{ id: 'thabo', name: 'Thabo Nkosi' }];
              case 'contractingServices.patch':
                patched.push(JSON.parse(String(init?.body)));
                return record;
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
    routeTree: createRootRoute({ component: () => <ServiceRecordPage id={record.id} /> }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  await act(async () =>
    createRoot(container).render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <RouterProvider router={router} />
        </TRPCProvider>
      </QueryClientProvider>,
    ),
  );
  await act(async () => {
    await vi.waitFor(() => expect(container.textContent).toContain('Open the Machine'));
    await vi.waitFor(() => expect(container.textContent).toContain('John Deere'));
  });
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((each) => each.textContent?.trim() === name);
  return { container, button, patched };
}

test('an open record shows its Machine, autosaves a notes change and closes through the dialog', async () => {
  const { container, button, patched } = await mount(openRecord);

  expect(container.querySelector('h1')?.textContent).toContain('JD110-1');
  expect(container.textContent).toContain('Booked in 20 Oct 2026 · Thabo');
  expect(container.querySelector('a')?.getAttribute('href')).toBe(`/contracting/fleet/${machine.id}/edit`);

  const notes = container.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');
  if (!notes) throw new Error('Notes missing');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(notes, 'Oil, filters, belts');
    notes.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    notes.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await act(async () => {
    await vi.waitFor(() => expect(patched).toMatchObject([{ id: openRecord.id, notes: 'Oil, filters, belts' }]));
  });

  await act(async () => button('Close service')?.click());
  await act(async () => {
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Record what was done'),
    );
  });
});

test('a closed record reads back what was recorded, with nothing to edit or close', async () => {
  const { container, button } = await mount(closedRecord);

  expect(container.textContent).toContain('Closed 22 Oct 2026 by Sipho');
  expect(container.textContent).toMatch(/Closed 22 Oct 2026, \d\d:\d\d by Sipho/);
  expect(container.textContent).toMatch(/Next service due set5\s112\.5 h/);
  expect(button('Close service')).toBeUndefined();
  expect(container.querySelectorAll('input, textarea')).toHaveLength(0);
});

test('a reader without contracting_service:update sees the open record but cannot close it', async () => {
  const { container, button } = await mount(openRecord, { without: ['contracting_service:update'] });

  expect(container.textContent).toContain('Booked in 20 Oct 2026');
  expect(button('Close service')).toBeUndefined();
  expect(container.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')?.closest('fieldset')?.disabled).toBe(
    true,
  );
});
