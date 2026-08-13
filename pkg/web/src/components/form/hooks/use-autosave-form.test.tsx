// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAutosaveForm } from './use-autosave-form.js';

vi.mock('@tanstack/react-router', () => ({ useBlocker: vi.fn() }));

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => root.unmount());
  }
  mountedRoots.length = 0;
  for (const container of mountedContainers) {
    container.remove();
  }
  mountedContainers.length = 0;
});

describe('useAutosaveForm', () => {
  it('defers blur autosave and saves the latest NumberField value', async () => {
    const save = vi.fn<(input: { quantity: number }) => Promise<void>>().mockResolvedValue();
    const container = document.createElement('div');
    document.body.append(container);
    mountedContainers.push(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
      root.render(<AutosaveNumberForm save={save} />);
    });

    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      setNativeInputValue(input as HTMLInputElement, '6');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      input?.blur();
      expect(save).not.toHaveBeenCalled();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(save).toHaveBeenCalledWith({ quantity: 6 });
      });
    });
  });

  it('saves the rounded value a whole-unit NumberField displays', async () => {
    const save = vi.fn<(input: { quantity: number }) => Promise<void>>().mockResolvedValue();
    const container = document.createElement('div');
    document.body.append(container);
    mountedContainers.push(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
      root.render(<AutosaveNumberForm decimals={0} save={save} />);
    });

    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    act(() => {
      input?.focus();
      setNativeInputValue(input as HTMLInputElement, '7.5');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      input?.blur();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(save).toHaveBeenCalledWith({ quantity: 8 });
      });
    });
  });
});

function AutosaveNumberForm({
  decimals,
  save,
}: {
  decimals?: number;
  save: (input: { quantity: number }) => Promise<void>;
}) {
  const { form, formProps } = useAutosaveForm({
    defaultValues: { quantity: 5 },
    failureMessage: 'Unable to save quantity.',
    save,
    toInput: (values) => values,
    validator: z.object({ quantity: z.number() }),
  });

  return (
    <form {...formProps}>
      <form.AppField name="quantity">
        {(field) => <field.NumberField decimals={decimals} label="Quantity" />}
      </form.AppField>
    </form>
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) throw new Error('HTMLInputElement.value setter is unavailable');
  valueSetter.call(input, value);
}
