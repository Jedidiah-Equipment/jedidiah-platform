// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { FleetHistoryCard } from './FleetHistoryCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/use-access.js', () => ({ useCan: () => ({ can: true }) }));

const machineId = '11111111-1111-4111-8111-111111111111';

const reading = (overrides: Record<string, unknown>) => ({
  machineId,
  sequence: 1,
  role: 'spot',
  comment: null,
  photo: null,
  aiHint: null,
  aiValue: null,
  aiConfidence: null,
  aiVerification: 'not-applicable',
  disputed: false,
  disputeReason: null,
  disputedPreviousId: null,
  evidenceReviewedAt: null,
  amendedBy: null,
  amendedAt: null,
  amendmentReason: null,
  jobNumber: null,
  ...overrides,
});

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function renderHistory(readings: Record<string, unknown>[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://history.test/trpc',
        fetch: async (input) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          const data: Record<string, unknown> = {
            'contractingReadings.listByMachine': readings,
            'contractingBreakdowns.list': { items: [], nextCursor: null, total: 0 },
            'contractingServices.list': { items: [], nextCursor: null, total: 0 },
          };
          if (path in data) return Response.json({ result: { data: data[path] } });
          throw new Error(`Unexpected request ${path}`);
        },
      }),
    ],
  });
  createTrpcOptions(queryClient, trpcClient);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <FleetHistoryCard subject={{ machineId }} />
        </TRPCProvider>
      </QueryClientProvider>,
    );
  });
  cleanups.push(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
  });
  return container;
}

test('a John Deere reading names its source and is never stamped as missing a photo', async () => {
  const container = await renderHistory([
    reading({
      id: '22222222-2222-4222-8222-222222222222',
      value: 1001,
      capturedAt: '2026-10-26T12:00:00.000Z',
      capturedByUserId: null,
      method: 'telematics',
      telematicsProvider: 'john-deere',
    }),
    reading({
      id: '33333333-3333-4333-8333-333333333333',
      value: 1000,
      capturedAt: '2026-10-25T12:00:00.000Z',
      capturedByUserId: 'foreman',
      method: 'manual',
      telematicsProvider: null,
    }),
  ]);
  await vi.waitFor(() => expect(container.textContent).toContain('1 001.0 h'));
  const rowOf = (text: string) =>
    [...container.querySelectorAll('tr')].find((row) => row.textContent?.includes(text))?.textContent ?? '';
  expect(rowOf('1 001.0 h')).toContain('John Deere');
  expect(rowOf('1 001.0 h')).not.toContain('Missing Photo Evidence');
  expect(rowOf('1 000.0 h')).toContain('Missing Photo Evidence');
  expect(rowOf('1 000.0 h')).not.toContain('John Deere');
});
