/** @vitest-environment jsdom */

import { readAtFromInput, readAtInputValue } from '@pkg/domain/contracting';
import { DateIso } from '@pkg/schema';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ReadingAmendDialog } from './ReadingAmendDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
// Read At carries seconds the picker cannot show.
const reading = {
  id: '00000000-0000-4000-8000-000000000001',
  value: 120.4,
  capturedAt: DateIso.parse('2026-10-27T13:00:42.000Z'),
};
const machine = { machineCode: 'BEL14-1', categoryIcon: 'tractor', categoryColour: 'lime' } as const;

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function button(label: string) {
  const result = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`Button missing: ${label}`);
  return result;
}

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onAmend = vi.fn(async () => undefined);
  const onAmended = vi.fn();
  const onOpenChange = vi.fn();
  async function render(open: boolean) {
    await act(async () => {
      root.render(
        <ReadingAmendDialog
          reading={reading}
          machine={machine}
          open={open}
          onOpenChange={onOpenChange}
          onAmend={onAmend}
          onAmended={onAmended}
          error={null}
        />,
      );
    });
  }
  await render(true);
  return { render, onAmend, onAmended, onOpenChange };
}

async function enter(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

it('validates the correction and mandatory reason before submitting the decimal amendment', async () => {
  const { onAmend, onAmended } = await mount();
  expect(button('Amend reading').disabled).toBe(false);
  await act(async () => button('Amend reading').click());
  expect(onAmend).not.toHaveBeenCalled();
  expect(document.querySelector('[name="reason"]')?.getAttribute('aria-invalid')).toBe('true');
  await enter('reason', 'Corrected from the meter');
  await enter('value', '-1');
  await act(async () => button('Amend reading').click());
  expect(onAmend).not.toHaveBeenCalled();
  expect(document.querySelector('[name="value"]')?.getAttribute('aria-invalid')).toBe('true');
  await enter('value', '128.5');
  await act(async () => button('Amend reading').click());
  expect(onAmend).toHaveBeenCalledExactlyOnceWith({
    amendments: [{ id: reading.id, value: 128.5, capturedAt: reading.capturedAt }],
    reason: 'Corrected from the meter',
  });
  expect(onAmended).toHaveBeenCalledOnce();
});

it('posts a corrected Read At from the picker', async () => {
  const { onAmend } = await mount();
  await enter('readAt-time', '07:30');
  await enter('reason', 'Captured the next evening');
  await act(async () => button('Amend reading').click());
  const day = readAtInputValue(new Date(reading.capturedAt)).slice(0, 10);
  expect(onAmend).toHaveBeenCalledExactlyOnceWith({
    amendments: [{ id: reading.id, value: 120.4, capturedAt: readAtFromInput(`${day}T07:30`)?.toISOString() }],
    reason: 'Captured the next evening',
  });
});

it('discards a cancelled correction and reopens with the recorded value and a fresh reason', async () => {
  const { render, onAmend, onOpenChange } = await mount();
  await enter('value', '130.7');
  await enter('reason', 'Draft correction');
  await act(async () => button('Cancel').click());
  expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  expect(onAmend).not.toHaveBeenCalled();
  await render(false);
  await render(true);
  expect(document.querySelector<HTMLInputElement>('[name="value"]')?.value).toBe('120.4');
  expect(document.querySelector<HTMLTextAreaElement>('[name="reason"]')?.value).toBe('');
  await act(async () => button('Amend reading').click());
  expect(onAmend).not.toHaveBeenCalled();
});
