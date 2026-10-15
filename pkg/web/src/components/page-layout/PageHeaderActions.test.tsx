// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog.js';
import { PageHeaderActions } from './PageHeaderActions.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const layout = { available: 0, buttons: 600 };
let resize = () => {};

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === 'page-header-actions' ? layout.available : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === 'page-header-actions-measure' ? layout.buttons : 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return { container, unmount: () => act(async () => root.unmount()) };
}

const visibleButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .filter((button) => !button.closest('[inert]'))
    .map((button) => button.textContent);

test('shows every action as a button while they fit on one row, and collapses only once they would wrap', async () => {
  layout.available = 900;
  const { container, unmount } = await render(
    <PageHeaderActions
      title="Stock on hand"
      actions={[
        { label: 'Print labels', onClick: () => {} },
        { label: 'Check out', onClick: () => {} },
      ]}
    />,
  );
  try {
    expect(visibleButtons(container)).toEqual(['Print labels', 'Check out']);

    layout.available = 599;
    await act(async () => resize());
    expect(visibleButtons(container)).toEqual(['Actions']);

    layout.available = 600;
    await act(async () => resize());
    expect(visibleButtons(container)).toEqual(['Print labels', 'Check out']);
  } finally {
    await unmount();
  }
});

test('a menu action opens its dialog after the menu closes, with disabled actions unavailable', async () => {
  layout.available = 100;
  const disabledAction = vi.fn();
  function Header() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <PageHeaderActions
          title="Stock on hand"
          actions={[
            { label: 'Print labels', onClick: () => setOpen(true) },
            { label: 'Unavailable', disabled: true, onClick: disabledAction },
          ]}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Print Part labels</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  const { container, unmount } = await render(<Header />);
  try {
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(['Print labels', 'Unavailable']);
    expect(items[1]?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => items[0]?.click());
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Print Part labels'),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(disabledAction).not.toHaveBeenCalled();
  } finally {
    await unmount();
  }
});
