// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog.js';
import { PageHeaderActions } from './PageHeaderActions.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('a menu action opens its dialog after the menu closes, with disabled actions unavailable', async () => {
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
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Header />));
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
    await act(async () => root.unmount());
    document.body.replaceChildren();
  }
});
