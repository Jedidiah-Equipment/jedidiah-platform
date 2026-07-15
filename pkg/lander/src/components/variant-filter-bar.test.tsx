// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { CatalogGroup } from '../server/catalog/products-data.js';
import { VariantFilterBar } from './variant-filter-bar.js';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/products">{children}</a>,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('VariantFilterBar', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  test('reports when its height transition finishes so the catalog can realign', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const onHeightTransitionEnd = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () =>
      root?.render(
        <VariantFilterBar
          activeGroup={groupWithVariant}
          activeVariant={undefined}
          onHeightTransitionEnd={onHeightTransitionEnd}
        />,
      ),
    );

    const transition = new Event('transitionend', { bubbles: true });
    Object.defineProperty(transition, 'propertyName', { value: 'grid-template-rows' });
    await act(async () => container.firstElementChild?.dispatchEvent(transition));

    expect(onHeightTransitionEnd).toHaveBeenCalledOnce();
  });
});

const groupWithVariant: CatalogGroup = {
  id: 'range-1',
  slug: 'crosshaul',
  name: 'Crosshaul',
  label: 'Crosshaul',
  description: '',
  count: 1,
  variants: [{ id: 'variant-1', slug: 'silage-grain', name: 'Silage Grain', label: 'Silage Grain' }],
  products: [],
};
