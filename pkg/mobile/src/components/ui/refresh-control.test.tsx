import { describe, expect, test, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: <T,>(callback: T) => callback,
  useSyncExternalStore: <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot(),
}));
vi.mock('react-native', () => ({ RefreshControl: 'NativeRefreshControl' }));
vi.mock('@/theme/use-brand-foreground', () => ({ useBrandForegroundColor: () => '#brand' }));

const invalidateQueries = vi.fn<() => Promise<void>>();
const queryClient = { invalidateQueries };
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => queryClient }));

import { RefreshControl } from './refresh-control';

type Control = React.ReactElement<{ onRefresh: () => void; refreshing: boolean }>;

describe('RefreshControl', () => {
  test('every surface shares one full invalidation until it settles', async () => {
    let settle = () => {};
    invalidateQueries.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const listPane = RefreshControl({}) as Control;
    const detailPane = RefreshControl({}) as Control;

    listPane.props.onRefresh();
    detailPane.props.onRefresh();
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith();
    expect((RefreshControl({}) as Control).props.refreshing).toBe(true);

    settle();
    await vi.waitFor(() => expect((RefreshControl({}) as Control).props.refreshing).toBe(false));
    detailPane.props.onRefresh();
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
