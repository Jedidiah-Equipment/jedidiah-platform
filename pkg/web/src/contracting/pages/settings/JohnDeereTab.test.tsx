// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import type { JohnDeereConnectionView } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
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

async function renderTab(connection: JohnDeereConnectionView, result?: 'connected' | 'not-connected' | 'error') {
  const requests: string[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://john-deere.test/trpc',
        fetch: async (input) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          requests.push(path);
          if (path === 'contractingJohnDeere.status') return Response.json({ result: { data: connection } });
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
  return { container, buttons, press, requests, onResultShown };
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
  expect(buttons()).toEqual(['Disconnect', 'Reconnect']);
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
