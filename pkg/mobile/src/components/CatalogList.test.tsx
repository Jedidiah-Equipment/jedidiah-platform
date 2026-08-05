import { describe, expect, test, vi } from 'vitest';

vi.mock('react', () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: <T,>(initialValue: T) => ({ current: initialValue }),
}));
vi.mock('react-native', () => ({ FlatList: 'FlatList', Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/Avatar', () => ({ Avatar: 'Avatar' }));
vi.mock('@/components/ui/pulse', () => ({ Pulse: 'Pulse' }));
vi.mock('@/components/ui/refresh-control', () => ({ RefreshControl: 'RefreshControl' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { CatalogListCard, CatalogListSkeleton, PaginatedCatalogList } from './CatalogList';

type ElementProps = { children?: unknown; className?: string; [key: string]: unknown };
type TestElement = React.ReactElement<ElementProps>;

function asElement(value: unknown): TestElement {
  return value as TestElement;
}

describe('CatalogListCard', () => {
  test('owns the full-width avatar, text hierarchy, trailing slot, and accessibility contract', () => {
    const onPress = vi.fn();
    const avatarFallback = <ViewMarker kind="custom-avatar" />;
    const trailing = <ViewMarker kind="price" />;
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarFallback,
        avatarName: 'Item name',
        avatarUri: 'data:image/png;base64,image',
        mainText: 'Main',
        monoText: 'MONO · 1 AUG 2026',
        onPress,
        subText: 'Sub',
        trailing,
      }),
    );
    const children = card.props.children as TestElement[];
    const textColumn = asElement(children[1]);
    const textLines = textColumn.props.children as TestElement[];
    const trailingFrame = asElement(children[2]);

    expect(card.props).toMatchObject({
      accessibilityHint: 'Opens details',
      accessibilityLabel: 'Catalog item',
      accessibilityRole: 'button',
      onPress,
    });
    expect(card.props.className).toContain('w-full');
    expect(children[0].props).toMatchObject({
      className: expect.stringContaining('h-11 w-11'),
      fallback: avatarFallback,
      name: 'Item name',
      uri: 'data:image/png;base64,image',
    });
    expect(textLines[0].props).toMatchObject({ children: 'Main', numberOfLines: 1 });
    expect(textLines[1].props).toMatchObject({ children: 'Sub', numberOfLines: 1 });
    expect(textLines[2].props).toMatchObject({ children: 'MONO · 1 AUG 2026', mono: true, numberOfLines: 1 });
    expect(trailingFrame.props.children).toBe(trailing);
  });

  test('omits the optional trailing frame', () => {
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarName: 'Item name',
        mainText: 'Main',
        monoText: 'Mono',
        onPress: vi.fn(),
        subText: 'Sub',
      }),
    );

    expect((card.props.children as unknown[])[2]).toBeNull();
  });

  test('keeps skeleton rows at the same fixed height as loaded cards', () => {
    const card = asElement(
      CatalogListCard({
        accessibilityHint: 'Opens details',
        accessibilityLabel: 'Catalog item',
        avatarName: 'Item name',
        mainText: 'Main',
        monoText: 'Mono',
        onPress: vi.fn(),
        subText: 'Sub',
      }),
    );
    const skeleton = asElement(CatalogListSkeleton({}));
    const firstSkeletonRow = asElement((skeleton.props.children as TestElement[])[0]);

    expect(card.props.className).toContain('h-[76px]');
    expect(firstSkeletonRow.props.className).toContain('h-[76px]');
  });
});

describe('PaginatedCatalogList', () => {
  test('flattens optional sections into one full-width virtualized list', () => {
    const priorityHeader = <ViewMarker kind="priority" />;
    const list = asElement(
      PaginatedCatalogList({
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
    expect(list.props.contentContainerClassName).toContain('w-full');
    expect(list.props.numColumns).toBeUndefined();
    expect(rows.map((row) => [row.kind, row.key])).toEqual([
      ['section-header', 'section:priority'],
      ['item', 'item:priority:priority-1'],
      ['section-separator', 'separator:main'],
      ['item', 'item:main:main-1'],
    ]);
    expect(renderedItem.props.className).toContain('w-full');
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
    PaginatedCatalogList({
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
