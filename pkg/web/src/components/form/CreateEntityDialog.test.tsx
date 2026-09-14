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

  it('retains a diagnostic trace when creation rejects', async () => {
    const error = new Error('unexpected');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const submit = await mount({ name: 'valid', onCreate: vi.fn(async () => Promise.reject(error)) });

    await act(async () => submit.click());

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Create entity submission failed', error));
  });
});
