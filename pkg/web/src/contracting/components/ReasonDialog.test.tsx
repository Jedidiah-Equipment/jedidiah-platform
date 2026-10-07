/** @vitest-environment jsdom */

import { requiredTrimmedText } from '@pkg/schema';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReasonDialog } from './ReasonDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const submit = vi.fn(async (_text: string) => undefined);
  const onOpenChange = vi.fn();
  await act(async () =>
    root.render(
      <ReasonDialog
        open
        onOpenChange={onOpenChange}
        title="Mark Breakdown solved"
        label="Close-out note"
        submitLabel="Mark solved"
        schema={requiredTrimmedText('A close-out note is required')}
        submit={submit}
      />,
    ),
  );
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Mark solved');
  if (!button) throw new Error('Mark solved action missing');
  return { button, submit, onOpenChange };
}

function reason() {
  const input = document.querySelector<HTMLTextAreaElement>('[name="reason"]');
  if (!input) throw new Error('Reason field missing');
  return input;
}

it('requires the text', async () => {
  const { button, submit } = await mount();
  await act(async () => button.click());
  expect(submit).not.toHaveBeenCalled();
  expect(reason().getAttribute('aria-invalid')).toBe('true');
});

it('submits the text and closes', async () => {
  const { button, submit, onOpenChange } = await mount();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(reason(), 'Hose replaced');
    reason().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await act(async () => button.click());
  expect(submit).toHaveBeenCalledWith('Hose replaced');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
