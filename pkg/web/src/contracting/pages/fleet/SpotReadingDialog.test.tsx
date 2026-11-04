// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { TRPCProvider } from '@/lib/trpc.js';
import { type SpotReading, SpotReadingDialog } from './SpotReadingDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateReadings: async () => undefined }),
}));

// Read at a second past the minute, which the minute picker cannot show.
const spot: SpotReading = { id: '22222222-2222-4222-8222-222222222222', at: '2026-10-26T12:00:01.000Z', value: 1001 };

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function mount() {
  const posted: Record<string, unknown> = {};
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://readings.test/trpc',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          posted[path] = JSON.parse(String(init?.body));
          return Response.json({ result: { data: null } });
        },
      }),
    ],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <SpotReadingDialog reading={spot} onClose={onClose} />
        </TRPCProvider>
      </QueryClientProvider>,
    ),
  );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
    document.body.replaceChildren();
  });
  return { posted, onClose };
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === label);

test('saves corrected hours at the Read At the reading already has, to the second', async () => {
  const { posted, onClose } = await mount();
  await act(async () => {
    const field = document.querySelector<HTMLInputElement>('[name="hours"]');
    if (!field) throw new Error('Missing the hours');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, '1000.5');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Save reading')?.click());
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(posted['contractingReadings.amend']).toEqual({ id: spot.id, value: 1000.5, capturedAt: spot.at });
});

test('deletes the reading once confirmed', async () => {
  const { posted, onClose } = await mount();
  await act(async () => button('Delete reading')?.click());
  await act(async () => button('Delete')?.click());
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(posted['contractingReadings.remove']).toEqual({ id: spot.id });
});
