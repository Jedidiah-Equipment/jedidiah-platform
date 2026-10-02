/** @vitest-environment jsdom */

import type { Assignment } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GapResolveDialog } from './GapResolveDialog.js';

const resolve = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: async () => undefined }),
}));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    contractingJobs: { assignments: { resolveGap: { mutationOptions: (options: unknown) => options } } },
  }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useMutation: () => ({ mutateAsync: resolve, reset: () => undefined, error: null }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const stint = {
  id: '00000000-0000-4000-8000-000000000001',
  machineCode: 'BEL14-1',
  categoryIcon: 'tractor',
  categoryColour: 'green',
  gapHours: 9.5,
} as Assignment;

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  resolve.mockClear();
});

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<GapResolveDialog stint={stint} onClose={vi.fn()} />));
  const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save');
  if (!save) throw new Error('Save action missing');
  return { save };
}

function field(name: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  return input;
}

async function enter(name: string, value: string) {
  const input = field(name);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

async function blur(name: string) {
  const input = field(name);
  await act(async () => {
    input.focus();
    input.blur();
  });
}

it('opens with the whole gap as travel', async () => {
  await mount();
  expect(field('travelHours').value).toBe('9.5');
  expect(field('unaccountedHours').value).toBe('0.0');
});

it('moves the other field as one is typed', async () => {
  await mount();
  await enter('travelHours', '2.5');
  expect(field('unaccountedHours').value).toBe('7.0');
  await enter('unaccountedHours', '3');
  expect(field('travelHours').value).toBe('6.5');
});

it('clamps the typed field to the gap on blur', async () => {
  await mount();
  await enter('travelHours', '12');
  await blur('travelHours');
  expect(field('travelHours').value).toBe('9.5');
  expect(field('unaccountedHours').value).toBe('0.0');
});

it('submits a split that totals the gap with its reason', async () => {
  const { save } = await mount();
  await enter('travelHours', '2.5');
  await enter('reason', 'Road move');
  await act(async () => save.click());
  expect(resolve).toHaveBeenCalledWith({
    id: stint.id,
    travelHours: 2.5,
    unaccountedHours: 7,
    reason: 'Road move',
  });
});

it('requires a reason', async () => {
  const { save } = await mount();
  await act(async () => save.click());
  expect(resolve).not.toHaveBeenCalled();
  expect(field('reason').getAttribute('aria-invalid')).toBe('true');
});
