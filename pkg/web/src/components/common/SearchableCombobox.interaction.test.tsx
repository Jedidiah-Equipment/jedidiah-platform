/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchableCombobox, type SearchableComboboxOption } from './SearchableCombobox.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

async function renderCombobox(options: readonly SearchableComboboxOption[], value = '') {
  const container = document.createElement('div');
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const onValueChange = vi.fn();
  const root = createRoot(container);
  mountedRoots.push(root);
  document.body.append(container);

  await act(async () => {
    root.render(
      <form onSubmit={onSubmit}>
        <SearchableCombobox inputId="part" onValueChange={onValueChange} options={options} value={value} />
        <input aria-label="Quantity" />
      </form>,
    );
  });

  const form = container.querySelector('form');
  const input = container.querySelector<HTMLInputElement>('#part');
  if (!form || !input) throw new Error('Combobox test fixture did not render');

  return {
    form,
    input,
    onSubmit,
    onValueChange,
  };
}

async function enterInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

async function pressKey(input: HTMLInputElement, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
  await act(async () => {
    input.dispatchEvent(event);
  });

  return event;
}

async function scan(input: HTMLInputElement, value: string): Promise<KeyboardEvent> {
  await enterInput(input, value);
  return pressKey(input, 'Enter');
}

describe('SearchableCombobox exact input values', () => {
  const parts = [
    {
      exactInputValue: 'HYD-0052',
      label: 'HYD-0052 · 219M Hydraulic Auger 125Cc Motor',
      value: 'part-id',
    },
  ] as const;

  it('commits an exact scanner value instead of submitting the parent form', async () => {
    const rendered = await renderCombobox(parts);
    const enter = await scan(rendered.input, 'HYD-0052');
    if (!enter.defaultPrevented) rendered.form.requestSubmit();

    expect(rendered.onValueChange).toHaveBeenCalledWith('part-id');
    expect(rendered.onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit or commit a partial scanner value', async () => {
    const rendered = await renderCombobox(parts);
    const enter = await scan(rendered.input, 'HYD-005');
    if (!enter.defaultPrevented) rendered.form.requestSubmit();

    expect(rendered.onValueChange).not.toHaveBeenCalled();
    expect(rendered.onSubmit).not.toHaveBeenCalled();
  });

  it('still commits a partial search after the user highlights an option with the keyboard', async () => {
    const rendered = await renderCombobox(parts);
    await enterInput(rendered.input, 'HYD-005');
    await pressKey(rendered.input, 'ArrowDown');
    await pressKey(rendered.input, 'Enter');

    expect(rendered.onValueChange).toHaveBeenCalledWith('part-id');
    expect(rendered.onSubmit).not.toHaveBeenCalled();
  });

  it('does not let a pointer-highlighted fuzzy match override scanner exactness', async () => {
    const rendered = await renderCombobox(parts);
    await enterInput(rendered.input, 'HYD-005');
    const option = document.querySelector<HTMLElement>('[role="option"]');
    if (!option) throw new Error('Combobox test fixture did not render an option');

    await act(async () => {
      option.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    });
    expect(option.hasAttribute('data-highlighted')).toBe(true);

    const enter = await pressKey(rendered.input, 'Enter');
    if (!enter.defaultPrevented) rendered.form.requestSubmit();

    expect(rendered.onValueChange).not.toHaveBeenCalled();
    expect(rendered.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the parent form when the selected option label is still in the input', async () => {
    const rendered = await renderCombobox(parts, 'part-id');
    const enter = await scan(rendered.input, parts[0].label);
    if (!enter.defaultPrevented) rendered.form.requestSubmit();

    expect(rendered.onValueChange).not.toHaveBeenCalled();
    expect(rendered.onSubmit).toHaveBeenCalledOnce();
  });
});
