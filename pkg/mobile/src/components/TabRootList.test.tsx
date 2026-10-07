import { describe, expect, test, vi } from 'vitest';

vi.mock('react', () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: <T,>(initialValue: T) => ({ current: initialValue }),
}));
vi.mock('react-native', () => ({ FlatList: 'FlatList', View: 'View' }));
vi.mock('@/components/ListControls', () => ({
  ListHeader: 'ListHeader',
  ListRow: 'ListRow',
}));
vi.mock('@/components/ui/refresh-control', () => ({ RefreshControl: 'RefreshControl' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { MAIN_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { TabRootList, type TabRootListPagination } from './TabRootList';

type ElementProps = { children?: unknown; className?: string; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

describe('TabRootList', () => {
  test('flattens optional sections into one full-width virtualized list that pulls to refresh', () => {
    const priorityHeader = <ViewMarker kind="priority" />;
    const list = asElement(
      TabRootList({
        emptyContent: <ViewMarker kind="empty" />,
        header: <ViewMarker kind="controls" />,
        keyOf: (item: { id: string }) => item.id,
        renderItem: (item) => <ViewMarker kind={item.id} />,
        sections: [
          { data: [{ id: 'priority-1' }], header: priorityHeader, key: 'priority' },
          { data: [{ id: 'main-1' }], key: 'main' },
        ],
      }),
    );
    const rows = list.props.data as { key: string; kind: string }[];
    const renderedItem = asElement(
      (list.props.renderItem as (input: { item: (typeof rows)[number] }) => TestElement)({ item: rows[1] }),
    );

    expect(list.type).toBe('FlatList');
    expect(list.props.className).toContain('flex-1');
    expect(list.props.contentContainerStyle).toBe(MAIN_PAGE_CONTENT_STYLE);
    expect(list.props.numColumns).toBeUndefined();
    expect(asElement(list.props.refreshControl).type).toBe('RefreshControl');
    expect(rows.map((row) => [row.kind, row.key])).toEqual([
      ['section-header', 'section:priority'],
      ['item', 'item:priority:priority-1'],
      ['section-separator', 'separator:main'],
      ['item', 'item:main:main-1'],
    ]);
    expect(renderedItem.type).toBe('ListRow');
  });

  test('loads near the end once per request only when another page is available and idle', () => {
    const onLoadMore = vi.fn();
    const ready = tabRootList({ hasNextPage: true, loadingMore: false, onLoadMore });
    const fetching = tabRootList({ hasNextPage: true, loadingMore: true, onLoadMore });
    const complete = tabRootList({ hasNextPage: false, loadingMore: false, onLoadMore });
    const loading = tabRootList({ hasNextPage: true, loadingMore: false, onLoadMore }, true);

    (ready.props.onEndReached as () => void)();
    (ready.props.onEndReached as () => void)();
    (fetching.props.onEndReached as () => void)();
    (complete.props.onEndReached as () => void)();
    (loading.props.onEndReached as () => void)();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

function tabRootList(pagination: Omit<TabRootListPagination, 'loadingMoreLabel'>, initialLoading = false): TestElement {
  return asElement(
    TabRootList({
      emptyContent: null,
      initialLoading,
      keyOf: (item: { id: string }) => item.id,
      loadingContent: null,
      pagination: { ...pagination, loadingMoreLabel: 'Loading more…' },
      renderItem: () => null,
      sections: [{ data: [{ id: 'one' }], key: 'items' }],
    }),
  );
}

function ViewMarker({ kind: _kind }: { kind: string }) {
  return null;
}
