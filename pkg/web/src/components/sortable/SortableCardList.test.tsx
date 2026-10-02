/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SortableCardList } from './SortableCardList.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

type Row = { id: string; name: string };
const dryHire: Row = { id: 'rate-1', name: 'Dry hire' };

async function mount({ canReorder = true, onOpen }: { canReorder?: boolean; onOpen?: (row: Row) => void }) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const grips: unknown[] = [];
  await act(async () =>
    root.render(
      <SortableCardList
        canReorder={canReorder}
        emptyMessage="No Rates yet."
        headerClassName="grid"
        label={(row) => row.name}
        {...(onOpen ? { onOpen } : {})}
        order={{ rows: [dryHire], isSaving: false, onDragEnd: vi.fn() }}
      >
        {(row, grip) => {
          grips.push(grip);
          return (
            <>
              {grip}
              <span>{row.name}</span>
            </>
          );
        }}
      </SortableCardList>,
    ),
  );
  return { grips };
}

const grip = () => document.querySelector<HTMLButtonElement>('button[aria-label="Reorder Dry hire"]');
const card = () => document.querySelector<HTMLElement>('[data-slot="card"]');
const pressEnter = (target: Element) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

it('passes a grip only to people who can reorder', async () => {
  const { grips } = await mount({ canReorder: false });
  expect(grips.every((item) => item === null)).toBe(true);
  expect(grip()).toBeNull();
});

it('makes a card a button only when onOpen is given', async () => {
  const onOpen = vi.fn();
  await mount({ onOpen });
  const opener = card();
  expect(opener?.getAttribute('role')).toBe('button');
  expect(opener?.getAttribute('aria-label')).toBe('Open Dry hire');
  await act(async () => pressEnter(grip() as HTMLButtonElement));
  await act(async () => grip()?.click());
  expect(onOpen).not.toHaveBeenCalled();
  await act(async () => pressEnter(opener as HTMLElement));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(dryHire);

  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  await mount({});
  const plain = card();
  expect(plain?.hasAttribute('role')).toBe(false);
  expect(plain?.hasAttribute('tabindex')).toBe(false);
  expect(plain?.hasAttribute('aria-label')).toBe(false);
});
