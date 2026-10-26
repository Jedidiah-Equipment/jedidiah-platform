// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import type {
  JohnDeereConnectionView,
  JohnDeereLinkView,
  JohnDeereUnlinkedMachine,
  Machine,
} from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { buildMachine } from '@/contracting/test/fleet-fixtures.js';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { JohnDeereTab } from './JohnDeereTab.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));

const base: JohnDeereConnectionView = {
  configured: true,
  status: 'not-connected',
  organizations: [],
  connectedBy: null,
  connectedAt: null,
  lastPolledAt: null,
  lastError: null,
};

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllMocks();
});

type Served = { unlinked?: JohnDeereUnlinkedMachine[]; links?: JohnDeereLinkView[]; machines?: Machine[] };

async function renderTab(
  connection: JohnDeereConnectionView,
  result?: 'connected' | 'not-connected' | 'error',
  served: Served = {},
) {
  const requests: string[] = [];
  const bodies: Record<string, unknown> = {};
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://john-deere.test/trpc',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          requests.push(path);
          if (init?.body) bodies[path] = JSON.parse(String(init.body));
          const data: Record<string, unknown> = {
            'contractingJohnDeere.status': connection,
            'contractingJohnDeere.equipment.list': served.unlinked ?? [],
            'contractingJohnDeere.links.list': served.links ?? [],
            'contractingFleet.machines.list': served.machines ?? [],
            'contractingJohnDeere.links.create': null,
          };
          if (path in data) return Response.json({ result: { data: data[path] } });
          if (path === 'contractingJohnDeere.connect.start')
            return Response.json({ result: { data: { url: 'https://signin.example/authorize?state=x' } } });
          throw new Error(`Unexpected request ${path}`);
        },
      }),
    ],
  });
  const trpc = createTrpcOptions(queryClient, trpcClient);
  await queryClient.fetchQuery(trpc.contractingJohnDeere.status.queryOptions());
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onResultShown = vi.fn();
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <JohnDeereTab result={result} onResultShown={onResultShown} />
        </TRPCProvider>
      </QueryClientProvider>,
    );
  });
  cleanups.push(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
  });
  const buttons = () => [...container.querySelectorAll('button')].map((button) => button.textContent?.trim());
  const press = async (label: string) => {
    const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
    if (!button) throw new Error(`Missing ${label}`);
    await act(async () => button.click());
  };
  return { container, buttons, press, requests, bodies, onResultShown };
}

test('Not configured explains the missing keys and offers nothing to press', async () => {
  const { container, buttons } = await renderTab({ ...base, configured: false });
  expect(container.textContent).toContain('Not configured');
  expect(container.textContent).toContain('JOHN_DEERE_CLIENT_ID');
  expect(buttons()).toEqual([]);
});

test('Not connected sends the browser to John Deere on Connect', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  try {
    const { container, buttons, press, requests } = await renderTab(base);
    expect(container.textContent).toContain('Not connected');
    expect(buttons()).toEqual(['Connect']);
    await press('Connect');
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://signin.example/authorize?state=x'));
    expect(requests).toContain('contractingJohnDeere.connect.start');
  } finally {
    vi.unstubAllGlobals();
  }
});

test('Connected names the organizations, who connected and when, with Disconnect and Reconnect', async () => {
  const { container, buttons } = await renderTab({
    ...base,
    status: 'connected',
    organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
    connectedBy: { id: 'u1', name: 'Jed Botha' },
    connectedAt: '2026-10-26T08:00:00.000Z' as JohnDeereConnectionView['connectedAt'],
  });
  expect(container.textContent).toContain('Jedidiah Boerdery');
  expect(container.textContent).toMatch(/Connected by Jed on 26 Oct 2026/);
  expect(container.textContent).toContain('Last poll: not yet');
  expect(buttons()).toEqual(['Disconnect', 'Reconnect', 'Refresh']);
});

test('Needs reconnecting shows the error with Disconnect and Reconnect', async () => {
  const { container, buttons } = await renderTab({
    ...base,
    status: 'needs-reconnect',
    lastError: 'John Deere refused the sign-in.',
  });
  expect(container.textContent).toContain('Needs reconnecting');
  expect(container.textContent).toContain('John Deere refused the sign-in.');
  expect(buttons()).toEqual(['Disconnect', 'Reconnect']);
});

test('a callback result shows one toast and is then dropped', async () => {
  const { onResultShown } = await renderTab({ ...base, status: 'connected' }, 'connected');
  expect(toast.success).toHaveBeenCalledWith('John Deere connected', expect.anything());
  expect(onResultShown).toHaveBeenCalled();
  await renderTab(base, 'error');
  expect(toast.error).toHaveBeenCalledOnce();
});

const connected: JohnDeereConnectionView = {
  ...base,
  status: 'connected',
  organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
};

const deereMachine: JohnDeereUnlinkedMachine = {
  equipmentId: 'eq-1',
  principalId: 7,
  name: 'Big Green',
  serialNumber: '1RW8410RCNA012345',
  make: 'JOHN DEERE',
  model: '8R 410',
  modelYear: '2022',
  lastHours: 812.3,
  lastReportTime: '2026-10-26T06:00:00.000Z' as JohnDeereUnlinkedMachine['lastReportTime'],
};

const ourMachine = buildMachine({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'T01',
  make: 'John Deere',
  model: '8R',
  latestReadingHours: 810,
  latestReadingAt: '2026-10-25T16:00:00.000Z',
});

const linkedDeere = {
  equipmentId: 'eq-9',
  principalId: 9,
  name: 'Other',
  lost: false,
  lastReportTime: null,
  lastValue: null,
};

const link = (overrides: Partial<JohnDeereLinkView> = {}): JohnDeereLinkView =>
  ({
    id: '22222222-2222-4222-8222-222222222222',
    machine: {
      id: ourMachine.id,
      code: 'T02',
      categoryIcon: 'tractor',
      categoryColour: 'lime',
      retiredAt: null,
      latestReadingHours: 1500,
      latestReadingAt: null,
    },
    equipmentId: 'eq-2',
    principalId: 8,
    deereName: 'Old Green',
    serialNumber: 'PIN-2',
    linkedAt: '2026-10-20T08:00:00.000Z',
    lost: false,
    lastPolledAt: null,
    lastReportTime: null,
    lastValue: null,
    lastError: null,
    ...overrides,
  }) as JohnDeereLinkView;

test('Connected lists the unlinked machines with their hours and the Links with their status', async () => {
  const { container } = await renderTab(connected, undefined, {
    unlinked: [
      deereMachine,
      { ...deereMachine, equipmentId: 'eq-3', name: 'Quiet Green', lastHours: null, lastReportTime: null },
    ],
    links: [link(), link({ id: '33333333-3333-4333-8333-333333333333', lost: true, deereName: 'Gone Green' })],
  });
  await vi.waitFor(() => expect(container.textContent).toContain('Big Green'));
  expect(container.textContent).toContain('JOHN DEERE · 8R 410 · 2022');
  expect(container.textContent).toContain('812.3 h');
  expect(container.textContent).toContain('26 Oct 2026');
  expect(container.textContent).toContain('No report');
  await vi.waitFor(() => expect(container.textContent).toContain('Old Green'));
  const rowOf = (name: string) =>
    [...container.querySelectorAll('tr')].find((row) => row.textContent?.includes(name))?.textContent ?? '';
  expect(rowOf('Old Green')).toContain('OK');
  expect(rowOf('Gone Green')).toContain('Lost');
});

test('the Link dialog puts both meters side by side and links the picked Machine', async () => {
  const { container, press, bodies } = await renderTab(connected, undefined, {
    unlinked: [deereMachine],
    machines: [
      ourMachine,
      buildMachine({ id: '44444444-4444-4444-8444-444444444444', code: 'T09', johnDeere: { ...linkedDeere } }),
    ],
  });
  await vi.waitFor(() => expect(container.textContent).toContain('Big Green'));
  await press('Link');
  await vi.waitFor(() => expect(document.body.textContent).toContain('Link only when the two meters agree'));

  const input = [...document.querySelectorAll<HTMLInputElement>('input[role="combobox"]')][0];
  if (!input) throw new Error('Machine combobox missing');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'T');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  // A Machine already linked is not offered.
  expect(options.map((option) => option.textContent?.trim())).toEqual(['ExcavatorT01 · John Deere 8R']);
  await act(async () => options[0]?.click());

  const john = document.querySelector('[aria-label="John Deere"]')?.textContent ?? '';
  const ours = document.querySelector('[aria-label="Ours"]')?.textContent ?? '';
  expect(john).toContain('Big Green');
  expect(john).toContain('PIN 1RW8410RCNA012345');
  expect(john).toContain('812.3 h');
  expect(ours).toContain('T01');
  expect(ours).toContain('810.0 h');
  expect(ours).toContain('Read At');

  const submit = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
    (button) => button.textContent === 'Link',
  );
  await act(async () => submit?.click());
  await vi.waitFor(() =>
    expect(bodies['contractingJohnDeere.links.create']).toEqual({ machineId: ourMachine.id, equipmentId: 'eq-1' }),
  );
});
