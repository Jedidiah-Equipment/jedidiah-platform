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

  it('never saves or blocks leaving a disabled form even when its values are edited', async () => {
    const save = vi.fn<(input: unknown) => Promise<void>>().mockResolvedValue();
    const container = document.createElement('div');
    document.body.append(container);
    mountedContainers.push(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () =>
      root.render(
        <AutosavePairForm
          defaultValues={{ quantity: 5, due: 100 }}
          enabled={false}
          save={save}
          toInput={(values) => values}
        />,
      ),
    );
    const quantity = container.querySelector('input');
    act(() => {
      quantity?.focus();
      setNativeInputValue(quantity as HTMLInputElement, '6');
      quantity?.dispatchEvent(new Event('input', { bubbles: true }));
      quantity?.blur();
    });
    await act(async () => undefined);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([5, 7])(
    'preserves refetched fields when a save completes, even if its edited field refetches as %s',
    async (refetchedQuantity) => {
      const firstSave = deferredSave();
      const save = vi
        .fn<(input: unknown) => Promise<void>>()
        .mockReturnValueOnce(firstSave.promise)
        .mockResolvedValue(undefined);
      const toInput = vi.fn((values: { quantity: number; due: number }, saved: { quantity: number; due: number }) => ({
        values,
        saved,
      }));
      const container = document.createElement('div');
      document.body.append(container);
      mountedContainers.push(container);
      const root = createRoot(container);
      mountedRoots.push(root);
      const render = (due: number, quantity = 5) =>
        act(async () => {
          root.render(<AutosavePairForm defaultValues={{ quantity, due }} save={save} toInput={toInput} />);
        });
      await render(100);
      const [quantity, due] = [...container.querySelectorAll('input')];
      const editQuantity = (value: string) =>
        act(() => {
          quantity?.focus();
          setNativeInputValue(quantity as HTMLInputElement, value);
          quantity?.dispatchEvent(new Event('input', { bubbles: true }));
          quantity?.blur();
        });
      editQuantity('6');
      await act(async () => {
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      });
      await render(200, refetchedQuantity);
      expect(due?.value).toBe('200');
      await act(async () => firstSave.resolve());
      editQuantity('7');
      await act(async () => {
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      });
      expect(toInput).toHaveBeenLastCalledWith({ quantity: 7, due: 200 }, { quantity: 6, due: 200 });
    },
  );

  it('adopts a refetched default per untouched field, keeps an edit in flight, and hands the saved values to toInput', async () => {
    const save = vi.fn<(input: unknown) => Promise<void>>().mockResolvedValue();
    const toInput = vi.fn((values: { quantity: number; due: number }, saved: { quantity: number; due: number }) => ({
      values,
      saved,
    }));
    const container = document.createElement('div');
    document.body.append(container);
    mountedContainers.push(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const render = (due: number) =>
      act(async () => {
        root.render(<AutosavePairForm defaultValues={{ quantity: 5, due }} save={save} toInput={toInput} />);
      });

    await render(100);
    const [quantity, due] = [...container.querySelectorAll('input')];
    act(() => {
      quantity?.focus();
      setNativeInputValue(quantity as HTMLInputElement, '6');
      quantity?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // A sibling write moved Next Due on the server; the typed quantity is not flushed yet.
    await render(200);
    expect(due?.value).toBe('200');
    expect(quantity?.value).toBe('6');
    expect(save).not.toHaveBeenCalled();

    act(() => quantity?.blur());
    await act(async () => {
      await vi.waitFor(() => {
        expect(save).toHaveBeenCalledTimes(1);
      });
    });
    expect(toInput).toHaveBeenLastCalledWith({ quantity: 6, due: 200 }, { quantity: 5, due: 200 });
  });
});

function AutosavePairForm({
  defaultValues,
  enabled = true,
  save,
  toInput,
}: {
  defaultValues: { quantity: number; due: number };
  enabled?: boolean;
  save: (input: unknown) => Promise<void>;
  toInput: (values: { quantity: number; due: number }, saved: { quantity: number; due: number }) => unknown;
}) {
  const { form, formProps } = useAutosaveForm({
    defaultValues,
    enabled,
    failureMessage: 'Unable to save.',
    save,
    toInput,
    validator: z.object({ quantity: z.number(), due: z.number() }),
  });

  return (
    <form {...formProps}>
      <form.AppField name="quantity">{(field) => <field.NumberField label="Quantity" />}</form.AppField>
      <form.AppField name="due">{(field) => <field.NumberField label="Due" />}</form.AppField>
    </form>
  );
}

function AutosaveNumberForm({ save }: { save: (input: { quantity: number }) => Promise<void> }) {
  const { form, formProps } = useAutosaveForm({
    defaultValues: { quantity: 5 },
    failureMessage: 'Unable to save quantity.',
    save,
    toInput: (values) => values,
    validator: z.object({ quantity: z.number() }),
  });

  return (
    <form {...formProps}>
      <form.AppField name="quantity">{(field) => <field.NumberField label="Quantity" />}</form.AppField>
    </form>
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) throw new Error('HTMLInputElement.value setter is unavailable');
  valueSetter.call(input, value);
}

function deferredSave() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
