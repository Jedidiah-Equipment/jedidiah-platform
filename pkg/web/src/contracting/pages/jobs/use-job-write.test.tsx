/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useJobWrite, useResetOnOpen } from './use-job-write.js';

const invalidateJobs = vi.hoisted(() => vi.fn(async () => undefined));
const showError = vi.hoisted(() => vi.fn());
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({ useQueryInvalidation: () => ({ invalidateJobs }) }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => showError }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  showError.mockClear();
});

async function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return root;
}

async function renderWrite() {
  let write: ReturnType<typeof useJobWrite> | undefined;
  function Probe() {
    write = useJobWrite();
    return null;
  }
  await render(<Probe />);
  if (!write) throw new Error('Probe did not render');
  return write;
}

it('card options refresh Jobs on success and toast the fallback on failure', async () => {
  const write = await renderWrite();
  const options = write.card('Unable to X.');
  const error = new Error('refused');
  options.onError(error);
  expect(showError).toHaveBeenCalledWith(error, 'Unable to X.');
  expect(options.onSuccess).toBe(invalidateJobs);
});

it('dialog options refresh Jobs and set no error handler', async () => {
  const write = await renderWrite();
  expect(write.dialog.onSuccess).toBe(invalidateJobs);
  expect('onError' in write.dialog).toBe(false);
});

it('useResetOnOpen resets when the dialog opens and not while it stays open or closes', async () => {
  const reset = vi.fn();
  const mutation = { reset };
  function Probe({ open }: { open: boolean }) {
    useResetOnOpen(mutation, open);
    return null;
  }
  const root = await render(<Probe open={false} />);
  expect(reset).toHaveBeenCalledTimes(0);
  for (const [open, calls] of [
    [true, 1],
    [true, 1],
    [false, 1],
  ] as const) {
    await act(async () => root.render(<Probe open={open} />));
    expect(reset).toHaveBeenCalledTimes(calls);
  }
});
