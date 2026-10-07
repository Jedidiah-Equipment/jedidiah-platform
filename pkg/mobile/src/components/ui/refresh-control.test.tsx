import { describe, expect, test, vi } from 'vitest';

const setRefreshingCalls: boolean[][] = [];
vi.mock('react', () => ({
  useCallback: <T,>(callback: T) => callback,
  useState: <T,>(initialValue: T) => {
    const calls: boolean[] = [];
    setRefreshingCalls.push(calls);
    return [initialValue, (next: boolean) => calls.push(next)];
  },
}));
vi.mock('react-native', () => ({ RefreshControl: 'NativeRefreshControl' }));
vi.mock('@/theme/use-brand-foreground', () => ({ useBrandForegroundColor: () => '#brand' }));

const invalidateQueries = vi.fn<() => Promise<void>>();
const queryClient = { invalidateQueries };
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => queryClient }));

import { RefreshControl } from './refresh-control';

type Control = React.ReactElement<{ onRefresh: () => void }>;

describe('RefreshControl', () => {
  test('pulls share one full invalidation while only the pulled surfaces spin', async () => {
    let settle = () => {};
    invalidateQueries.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const listPane = RefreshControl({}) as Control;
    const detailPane = RefreshControl({}) as Control;
    RefreshControl({});
    const [listSpins, detailSpins, untouchedSpins] = setRefreshingCalls;

    listPane.props.onRefresh();
    detailPane.props.onRefresh();
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith();

    settle();
    await vi.waitFor(() => expect(detailSpins).toEqual([true, false]));
    expect(listSpins).toEqual([true, false]);
    expect(untouchedSpins).toEqual([]);

    detailPane.props.onRefresh();
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
