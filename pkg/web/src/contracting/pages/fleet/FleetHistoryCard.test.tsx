// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { DateIso } from '@pkg/schema';
import type { FleetHistoryKind, FleetHistoryRow } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { FleetHistoryCard, historyListFilters } from './FleetHistoryCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

const subject = { kind: 'machine', id: '11111111-1111-4111-8111-111111111111' } as const;

const telematicsReading: FleetHistoryRow = {
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'reading',
  at: DateIso.parse('2026-10-26T12:00:00.000Z'),
  title: 'Spot · 1 001.0 h',
  detail: null,
  source: 'John Deere',
  readingRole: 'spot',
  breakdown: null,
  opens: null,
};

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function renderHistory(kinds: FleetHistoryKind[]) {
  const listInputs: unknown[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://history.test/trpc',
        fetch: async (input) => {
          const url = new URL(String(input));
          const path = url.pathname.slice('/trpc/'.length);
          if (path === 'contractingFleet.history.list') {
            listInputs.push(JSON.parse(url.searchParams.get('input') ?? '{}'));
            return Response.json({ result: { data: { items: [telematicsReading], nextCursor: null, total: 1 } } });
          }
          if (path === 'contractingFleet.history.filters') return Response.json({ result: { data: { kinds } } });
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
          <FleetHistoryCard subject={subject} />
        </TRPCProvider>
      </QueryClientProvider>,
    );
  });
  cleanups.push(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
  });
  return { container, listInputs };
}

test('asks the server for one newest-first page of the subject’s History and shows what it says', async () => {
  const { container, listInputs } = await renderHistory(['reading', 'breakdown', 'service']);
  await vi.waitFor(() => expect(container.textContent).toContain('Spot · 1 001.0 h'));
  expect(container.textContent).toContain('John Deere');
  expect(listInputs).toEqual([
    expect.objectContaining({ subject, kinds: [], search: '', sortBy: 'at', sortDirection: 'desc' }),
  ]);
});

test('shows nothing when the caller can read no kind of the subject’s History', async () => {
  const { container } = await renderHistory([]);
  await vi.waitFor(() => expect(container.textContent).toBe(''));
});

test('asks for the picked kinds and plant days', () => {
  expect(
    historyListFilters([
      { id: 'kind', value: ['service', 'reading'] },
      { id: 'at', value: { start: '2026-10-01', end: '2026-10-08' } },
    ]),
  ).toEqual({ kinds: ['reading', 'service'], from: '2026-10-01', to: '2026-10-08' });
});
