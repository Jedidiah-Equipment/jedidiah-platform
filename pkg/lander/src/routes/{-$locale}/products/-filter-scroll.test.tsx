// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useProductsFilterScroll } from './index.js';

describe('products filter selection scrolling', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  async function renderScrollHarness(search: ProductsSearch, hasRestoredScroll = false) {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 507.5 } as DOMRect);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (property: string) => (property === '--filter-scroll-offset' ? '12px' : ''),
    } as CSSStyleDeclaration);
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const render = async (nextSearch: ProductsSearch, nextHasRestoredScroll = false) => {
      await act(async () =>
        root?.render(<ScrollHarness search={nextSearch} hasRestoredScroll={nextHasRestoredScroll} />),
      );
    };

    await render(search, hasRestoredScroll);

    return { render, scrollTo };
  }

  test('scrolls far enough to leave the first catalog heading below the sticky filters', async () => {
    const { scrollTo } = await renderScrollHarness({ range: 'trailers' });

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 495 });
  });

  test('scrolls the filter bar into view when All clears the current selection', async () => {
    const { render, scrollTo } = await renderScrollHarness({ range: 'trailers' });
    scrollTo.mockClear();
    await render({});

    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 495 });
  });

  test('leaves an unfiltered first visit at the top of the page', async () => {
    const { scrollTo } = await renderScrollHarness({});

    expect(scrollTo).not.toHaveBeenCalled();
  });

  test('preserves a restored grid position when returning to a filtered page', async () => {
    const { scrollTo } = await renderScrollHarness({ range: 'trailers' }, true);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

type ProductsSearch = { range?: string; variant?: string };

function ScrollHarness({ search, hasRestoredScroll }: { search: ProductsSearch; hasRestoredScroll: boolean }) {
  const target = useRef<HTMLDivElement>(null);
  useProductsFilterScroll(target, search, hasRestoredScroll);

  return <div ref={target} />;
}
