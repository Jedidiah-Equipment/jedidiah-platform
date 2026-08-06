import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { EntityComboboxLoadMore, loadNextPageAtListEnd } from './EntityCombobox.js';

describe('loadNextPageAtListEnd', () => {
  const atEnd = { clientHeight: 200, scrollHeight: 600, scrollTop: 400 };
  const midList = { clientHeight: 200, scrollHeight: 600, scrollTop: 100 };

  it('pages when the reader reaches the end of the list, which is where arrow keys land', () => {
    const onLoadMore = vi.fn();
    loadNextPageAtListEnd(atEnd, { hasNextPage: true, loadedCount: 20, onLoadMore, total: 57, totalLabel: String });

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('leaves the middle of the list alone', () => {
    const onLoadMore = vi.fn();
    loadNextPageAtListEnd(midList, { hasNextPage: true, loadedCount: 20, onLoadMore, total: 57, totalLabel: String });

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not stack requests on the last page or on a page already in flight', () => {
    const onLoadMore = vi.fn();
    const props = { loadedCount: 20, onLoadMore, total: 57, totalLabel: String };

    loadNextPageAtListEnd(atEnd, { ...props, hasNextPage: false });
    loadNextPageAtListEnd(atEnd, { ...props, hasNextPage: true, isFetchingNextPage: true });

    expect(onLoadMore).not.toHaveBeenCalled();
  });
});

describe('EntityComboboxLoadMore', () => {
  it('says how much of the list is loaded, so a truncated list never reads as the whole list', () => {
    const html = renderToStaticMarkup(
      <EntityComboboxLoadMore
        hasNextPage
        loadedCount={20}
        onLoadMore={vi.fn()}
        total={57}
        totalLabel={(total) => `${total} Jobs`}
      />,
    );

    expect(html).toContain('20 of 57 Jobs');
    expect(html).toContain('Load more');
  });

  it('drops the action once the last page is loaded', () => {
    const html = renderToStaticMarkup(
      <EntityComboboxLoadMore
        hasNextPage={false}
        loadedCount={57}
        onLoadMore={vi.fn()}
        total={57}
        totalLabel={(total) => `${total} Jobs`}
      />,
    );

    expect(html).toContain('57 of 57 Jobs');
    expect(html).not.toContain('Load more');
  });

  it('holds the action while the next page is in flight', () => {
    const html = renderToStaticMarkup(
      <EntityComboboxLoadMore
        hasNextPage
        isFetchingNextPage
        loadedCount={20}
        onLoadMore={vi.fn()}
        total={57}
        totalLabel={(total) => `${total} Jobs`}
      />,
    );

    expect(html).toContain('Loading…');
    expect(html).toContain('disabled');
  });

  it('stays out of the way while the first page is still loading', () => {
    const html = renderToStaticMarkup(
      <EntityComboboxLoadMore
        hasNextPage={false}
        loadedCount={0}
        onLoadMore={vi.fn()}
        total={0}
        totalLabel={(total) => `${total} Jobs`}
      />,
    );

    expect(html).toBe('');
  });
});
