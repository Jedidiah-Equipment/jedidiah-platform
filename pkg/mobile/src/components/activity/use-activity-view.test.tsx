import { DateIso } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test } from 'vitest';
import { type ActivityViewClient, useActivityViewMark } from './use-activity-view';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LAST_SEEN_KEY: [string[]] = [['activity', 'getLastSeen']];
const seen = DateIso.parse('2026-10-16T09:00:00.000Z');
const fakeClient: ActivityViewClient = {
  lastSeen: { queryKey: LAST_SEEN_KEY, queryFn: () => DateIso.parse('2026-10-01T08:00:00.000Z') },
  latest: { queryKey: [['activity', 'list']], queryFn: () => ({ items: [] }) },
  setLastSeen: (options) => ({ mutationFn: async ({ seenAt }) => seenAt, ...options }),
};
const globalView = { track: true, filter: 'all', search: '', scoped: false };

async function renderMark(view: Parameters<typeof useActivityViewMark>[1]) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let acknowledge: ReturnType<typeof useActivityViewMark>;
  function Harness() {
    acknowledge = useActivityViewMark(fakeClient, view);
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return { acknowledge: () => acknowledge, queryClient, unmount: () => act(async () => renderer?.unmount()) };
}

test('acknowledging the global feed writes the resolved mark under the business’s last-seen key', async () => {
  const { acknowledge, queryClient, unmount } = await renderMark(globalView);
  try {
    const acknowledgeLatest = acknowledge();
    expect(acknowledgeLatest).toBeDefined();
    await act(async () => acknowledgeLatest?.(seen));
    await expect.poll(() => queryClient.getQueryData(LAST_SEEN_KEY)).toBe(seen);
  } finally {
    await unmount();
  }
});

test.each([
  { view: 'an untracked feed', change: { track: false } },
  { view: 'a filter tab', change: { filter: 'notes' } },
  { view: 'a search', change: { search: 'gearbox' } },
  { view: 'one record’s own thread', change: { scoped: true } },
])('$view wires no acknowledgement', async ({ change }) => {
  const { acknowledge, unmount } = await renderMark({ ...globalView, ...change });
  try {
    expect(acknowledge()).toBeUndefined();
  } finally {
    await unmount();
  }
});
