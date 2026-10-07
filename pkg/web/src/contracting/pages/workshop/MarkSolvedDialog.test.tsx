/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkSolvedDialog } from './MarkSolvedDialog.js';

const solve = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateWorkshop: async () => undefined }),
}));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ contractingBreakdowns: { solve: { mutationOptions: (options: unknown) => options } } }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useMutation: () => ({ mutateAsync: solve, reset: () => undefined, error: null }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const breakdownId = '00000000-0000-4000-8000-000000000001';

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  solve.mockClear();
});

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<MarkSolvedDialog breakdownId={breakdownId} open onOpenChange={vi.fn()} />));
  const submit = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Mark solved',
  );
  if (!submit) throw new Error('Mark solved action missing');
  return { submit };
}

function note() {
  const input = document.querySelector<HTMLTextAreaElement>('[name="closeOutNote"]');
  if (!input) throw new Error('Close-out note missing');
  return input;
}

it('requires a close-out note', async () => {
  const { submit } = await mount();
  await act(async () => submit.click());
  expect(solve).not.toHaveBeenCalled();
  expect(note().getAttribute('aria-invalid')).toBe('true');
});

it('solves with the note', async () => {
  const { submit } = await mount();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(note(), 'Replaced the hose');
    note().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  await act(async () => submit.click());
  expect(solve).toHaveBeenCalledWith({ id: breakdownId, closeOutNote: 'Replaced the hose' });
});
