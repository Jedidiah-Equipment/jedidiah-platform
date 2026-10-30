/** @vitest-environment jsdom */

import type { Assignment } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ArrivalCaptureDialog } from './ArrivalCaptureDialog.js';

const capture = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('@/contracting/components/readings/capture-reading.js', () => ({ captureReading: capture }));
const latestId = '00000000-0000-4000-8000-000000000009';
vi.mock('@/contracting/components/readings/use-latest-reading.js', () => ({
  useLatestReading: () => ({
    refetch: async () => undefined,
    isSuccess: true,
    isPending: false,
    error: null,
    data: { id: latestId, role: 'spot', value: 130, capturedAt: '2026-09-17T12:00:00.000Z' },
  }),
}));
vi.mock('@/contracting/components/readings/use-read-at-estimate.js', () => ({
  useReadAtEstimate: (_target: unknown, value: number | null) => ({
    estimate: value === null ? undefined : { kind: 'now' },
    working: false,
    error: null,
  }),
}));
vi.mock('./use-assignment-options.js', () => ({
  useAssignmentOptions: () => ({ implementOptions: [], driverOptions: [], ready: true, error: null }),
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: async () => undefined, invalidateReadings: async () => undefined }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const stint = {
  id: '00000000-0000-4000-8000-000000000001',
  machineId: '00000000-0000-4000-8000-000000000002',
  machineCode: 'BEL14-1',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
  implementId: null,
  driverUserId: null,
} as Assignment;

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  capture.mockClear();
});

async function enter(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);

async function enterReadAt(date: string, time: string) {
  for (const [name, value] of [
    ['readAt', date],
    ['readAt-time', time],
  ] as const) {
    await enter(name, value);
    await act(async () => {
      document.querySelector(`[name="${name}"]`)?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  }
}

it('posts an arrival read before the latest reading, leaving its neighbours to the server', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<ArrivalCaptureDialog stint={stint} onClose={vi.fn()} />));
  const save = button('Save reading');
  if (!save) throw new Error('Save action missing');

  await act(async () => button('Earlier')?.click());
  await enter('value', '126');
  await enterReadAt('2026-09-16', '16:00');
  expect(document.body.textContent).not.toContain('This is below the latest reading');
  await act(async () => button('Date looks good')?.click());
  expect(document.body.textContent).toContain('Starting assignment');
  await act(async () => save.click());

  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      role: 'arrival',
      assignmentId: stint.id,
      value: 126,
      disputePrevious: false,
      capturedAt: new Date(2026, 8, 16, 16, 0).toISOString(),
    }),
    'Unable to capture arrival reading.',
  );
});
