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
import { PaginatedList } from './PaginatedList';

type ElementProps = { children?: unknown; className?: string; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

describe('PaginatedList', () => {
  test('flattens optional sections into one full-width virtualized list', () => {
    const priorityHeader = <ViewMarker kind="priority" />;
    const list = asElement(
      PaginatedList({
        emptyContent: <ViewMarker kind="empty" />,
        hasNextPage: true,
        header: <ViewMarker kind="controls" />,
        initialLoading: false,
        keyOf: (item: { id: string }) => item.id,
        loadingContent: <ViewMarker kind="loading" />,
        loadingMore: false,
        loadingMoreLabel: 'Loading more…',
        onLoadMore: vi.fn(),
        onRefresh: vi.fn(),
        refreshing: false,
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
    const ready = paginatedList({ hasNextPage: true, initialLoading: false, loadingMore: false, onLoadMore });
    const fetching = paginatedList({ hasNextPage: true, initialLoading: false, loadingMore: true, onLoadMore });
    const complete = paginatedList({ hasNextPage: false, initialLoading: false, loadingMore: false, onLoadMore });

    (ready.props.onEndReached as () => void)();
    (ready.props.onEndReached as () => void)();
    (fetching.props.onEndReached as () => void)();
    (complete.props.onEndReached as () => void)();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

function paginatedList({
  hasNextPage,
  initialLoading,
  loadingMore,
  onLoadMore,
}: {
  hasNextPage: boolean;
  initialLoading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return asElement(
    PaginatedList({
      emptyContent: null,
      hasNextPage,
      initialLoading,
      keyOf: (item: { id: string }) => item.id,
      loadingContent: null,
      loadingMore,
      loadingMoreLabel: 'Loading more…',
      onLoadMore,
      onRefresh: vi.fn(),
      refreshing: false,
      renderItem: () => null,
      sections: [{ data: [{ id: 'one' }], key: 'items' }],
    }),
  );
}

function ViewMarker({ kind: _kind }: { kind: string }) {
  return null;
}
