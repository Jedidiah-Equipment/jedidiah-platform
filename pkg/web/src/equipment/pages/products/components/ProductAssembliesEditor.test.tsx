// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssemblyRemoveButton } from './ProductAssembliesEditor.js';

const roots: Array<ReturnType<typeof createRoot>> = [];
const containers: HTMLDivElement[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const container of containers) container.remove();
  roots.length = 0;
  containers.length = 0;
});

describe('AssemblyRemoveButton', () => {
  it('warns with the nested Part count and removes only after confirmation', async () => {
    const onConfirm = vi.fn();
    const trigger = await renderRemoveButton({ onConfirm, partCount: 15 });

    expect(onConfirm).not.toHaveBeenCalled();
    await act(async () => trigger.click());

    expect(document.body.textContent).toContain('This Assembly contains 15 Parts. Are you sure you want to delete it?');
    expect(onConfirm).not.toHaveBeenCalled();

    const confirmButton = findButton('Delete');
    await act(async () => confirmButton.click());

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('still confirms removal when the Assembly has no Parts', async () => {
    const trigger = await renderRemoveButton({ onConfirm: vi.fn(), partCount: 0 });

    await act(async () => trigger.click());

    expect(document.body.textContent).toContain('Are you sure you want to delete this Assembly?');
    expect(document.body.textContent).not.toContain('contains 0 Parts');
  });
});

async function renderRemoveButton({ onConfirm, partCount }: { onConfirm: () => void; partCount: number }) {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => root.render(<AssemblyRemoveButton onConfirm={onConfirm} partCount={partCount} />));

  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Remove assembly"]');
  if (!trigger) throw new Error('Assembly removal trigger missing');
  return trigger;
}

function findButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`${label} button missing`);
  return button;
}
