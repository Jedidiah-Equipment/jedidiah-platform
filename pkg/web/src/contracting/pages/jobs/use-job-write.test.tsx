/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useResetOnOpen } from './use-job-write.js';

vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({ useQueryInvalidation: () => ({}) }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => undefined }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

async function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return root;
}

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
