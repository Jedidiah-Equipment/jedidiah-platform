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
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    vi.restoreAllMocks();
  });

  async function renderScrollHarness(search: ProductsSearch, hasRestoredScroll = false) {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const render = async (nextSearch: ProductsSearch, nextHasRestoredScroll = false) => {
      await act(async () =>
        root?.render(<ScrollHarness search={nextSearch} hasRestoredScroll={nextHasRestoredScroll} />),
      );
    };

    await render(search, hasRestoredScroll);

    return { render, scrollIntoView };
  }

  test('scrolls the filter bar into view when the page opens with a selected Range', async () => {
    const { scrollIntoView } = await renderScrollHarness({ range: 'trailers' });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  test('scrolls the filter bar into view when All clears the current selection', async () => {
    const { render, scrollIntoView } = await renderScrollHarness({ range: 'trailers' });
    scrollIntoView.mockClear();
    await render({});

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  test('leaves an unfiltered first visit at the top of the page', async () => {
    const { scrollIntoView } = await renderScrollHarness({});

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('preserves a restored grid position when returning to a filtered page', async () => {
    const { scrollIntoView } = await renderScrollHarness({ range: 'trailers' }, true);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

type ProductsSearch = { range?: string; variant?: string };

function ScrollHarness({ search, hasRestoredScroll }: { search: ProductsSearch; hasRestoredScroll: boolean }) {
  const target = useRef<HTMLDivElement>(null);
  useProductsFilterScroll(target, search, hasRestoredScroll);

  return <div ref={target} />;
}
