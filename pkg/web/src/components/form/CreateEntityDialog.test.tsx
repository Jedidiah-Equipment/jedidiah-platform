/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { CreateEntityDialog } from './CreateEntityDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

async function mount({
  disableSubmitWhenInvalid = false,
  name = '',
  onCreate = vi.fn(async () => undefined),
}: {
  disableSubmitWhenInvalid?: boolean;
  name?: string;
  onCreate?: (values: { name: string }) => Promise<void>;
} = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <CreateEntityDialog
        defaultValues={{ name }}
        description="Test create dialog"
        disableSubmitWhenInvalid={disableSubmitWhenInvalid}
        onCreate={onCreate}
        onCreated={() => undefined}
        onOpenChange={() => undefined}
        open
        title="Create thing"
        validator={z.object({ name: z.string().min(1) })}
      >
        {() => null}
      </CreateEntityDialog>,
    );
  });

  const submit = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save');
  if (!submit) throw new Error('Submit button missing');
  return submit;
}

describe('CreateEntityDialog', () => {
  it('does not apply live validation to existing dialogs unless they opt in', async () => {
    const submit = await mount();
    expect(submit.disabled).toBe(false);
  });

  it('can opt in to disabling submit until the current values are valid', async () => {
    const submit = await mount({ disableSubmitWhenInvalid: true });
    expect(submit.disabled).toBe(true);
  });

  it('starts a fresh form from the current defaults each time it opens', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    let readName: (() => string) | undefined;
    let setName: ((name: string) => void) | undefined;
    const render = (open: boolean, name: string) =>
      root.render(
        <CreateEntityDialog
          defaultValues={{ name }}
          onCreate={async () => undefined}
          onCreated={() => undefined}
          onOpenChange={() => undefined}
          open={open}
          title="Create thing"
          validator={z.object({ name: z.string() })}
        >
          {(form) => {
            readName = () => form.state.values.name;
            setName = (next) => form.setFieldValue('name', next);
            return null;
          }}
        </CreateEntityDialog>,
      );

    await act(async () => render(true, 'first'));
    await act(async () => setName?.('typed'));
    await act(async () => render(false, 'first'));
    await act(async () => render(true, 'second'));

    expect(readName?.()).toBe('second');
  });

  it('saves once the other field fixes a cross-field error a refused save left behind', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const onCreate = vi.fn(async () => undefined);
    let setField: ((name: 'startedOn' | 'completedOn', value: string) => void) | undefined;

    await act(async () =>
      root.render(
        <CreateEntityDialog
          defaultValues={{ completedOn: '2026-10-02', startedOn: '2026-10-01' }}
          onCreate={onCreate}
          onCreated={() => undefined}
          onOpenChange={() => undefined}
          open
          title="Edit times"
          validator={z
            .object({ completedOn: z.string(), startedOn: z.string() })
            .refine((value) => value.startedOn !== '' || value.completedOn === '', {
              message: 'A done date needs a start date.',
              path: ['startedOn'],
            })}
        >
          {(form) => {
            setField = (name, value) => form.setFieldValue(name, value);
            return null;
          }}
        </CreateEntityDialog>,
      ),
    );
    const submit = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save');
    if (!submit) throw new Error('Submit button missing');

    await act(async () => setField?.('startedOn', ''));
    await act(async () => submit.click());
    expect(onCreate).not.toHaveBeenCalled();

    await act(async () => setField?.('completedOn', ''));
    await act(async () => submit.click());

    expect(onCreate).toHaveBeenCalledWith({ completedOn: '', startedOn: '' });
  });

  it('retains a diagnostic trace when creation rejects', async () => {
    const error = new Error('unexpected');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const submit = await mount({ name: 'valid', onCreate: vi.fn(async () => Promise.reject(error)) });

    await act(async () => submit.click());

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Create entity submission failed', error));
  });
});
