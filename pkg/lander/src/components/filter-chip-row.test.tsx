// @vitest-environment jsdom

import { act, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { type FilterChip, FilterChipRow } from './filter-chip-row.js';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ref }: { children: ReactNode; ref?: Ref<HTMLAnchorElement> }) => (
    <a ref={ref} href="/products">
      {children}
    </a>
  ),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('FilterChipRow', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('keeps the visible filters on one line and moves excess filters into the More menu', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(250);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.textContent === 'All' ? 50 : 100;
    });

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<FilterChipRow chips={chips} />));

    const row = container.firstElementChild;
    expect(Array.from(row?.children ?? []).filter((child) => child.tagName === 'A')).toHaveLength(1);
    expect(row?.querySelector(':scope > a')?.textContent).toBe('All');
    expect(row?.querySelector('summary')?.textContent).toContain('More +2');
  });
});

const chips: FilterChip[] = [
  { key: 'all', label: 'All', active: true, search: {} },
  { key: 'crosshaul', label: 'Crosshaul', active: false, search: { range: 'crosshaul' } },
  { key: 'strip-till', label: 'Strip Till', active: false, search: { range: 'strip-till' } },
];
