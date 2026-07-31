// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { DropdownMenu } from './dropdown-menu.js';

let root: Root | undefined;

describe('DropdownMenu', () => {
  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  test('pushes the panel back on screen when right-aligning would clip it off the viewport', async () => {
    const panel = await renderOpenMenu({ triggerRight: 191, panelWidth: 220 });

    // Natural left edge would be -29px, so the panel shifts right far enough to clear the gutter.
    expect(panel.style.right).toBe('-41px');
  });

  test('leaves the panel right-aligned to its trigger when it already fits', async () => {
    const panel = await renderOpenMenu({ triggerRight: 400, panelWidth: 220 });

    expect(panel.style.right).toBe('');
  });
});

async function renderOpenMenu({ triggerRight, panelWidth }: { triggerRight: number; panelWidth: number }) {
  vi.spyOn(HTMLDetailsElement.prototype, 'getBoundingClientRect').mockReturnValue({
    right: triggerRight,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(panelWidth);

  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () =>
    root?.render(
      <DropdownMenu open onOpenChange={() => {}} label="More +8" triggerClassName="chip">
        <a href="/products">Crosshaul - Trailers</a>
      </DropdownMenu>,
    ),
  );

  const panel = container.querySelector('[role="menu"]');
  if (!(panel instanceof HTMLElement)) {
    throw new Error('menu panel did not render');
  }
  return panel;
}
