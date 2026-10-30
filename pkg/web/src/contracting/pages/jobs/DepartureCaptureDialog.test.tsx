/** @vitest-environment jsdom */

import { formatDate, formatHours } from '@pkg/domain';
import type { Assignment } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RouteRefusedError } from '@/contracting/lib/post-route.js';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';

const capture = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('@/contracting/components/readings/capture-reading.js', () => ({ captureReading: capture }));
const latestId = '00000000-0000-4000-8000-000000000009';
const refetchLatest = vi.hoisted(() => vi.fn(async () => undefined));
const latestProvider = vi.hoisted(() => ({ current: null as 'john-deere' | null }));
vi.mock('@/contracting/components/readings/use-latest-reading.js', () => ({
  useLatestReading: () => ({
    refetch: refetchLatest,
    isSuccess: true,
    isPending: false,
    error: null,
    data: {
      id: latestId,
      role: 'spot',
      value: 130,
      capturedAt: '2026-09-17T12:00:00.000Z',
      telematicsProvider: latestProvider.current,
    },
  }),
}));
vi.mock('@/contracting/components/readings/use-read-at-estimate.js', () => ({
  useReadAtEstimate: (_target: unknown, value: number | null) => ({
    estimate: value === null ? undefined : { kind: 'now' },
    working: false,
    error: null,
  }),
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
  arrival: { value: 120 },
} as Assignment;

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  capture.mockClear();
  refetchLatest.mockClear();
  latestProvider.current = null;
  vi.restoreAllMocks();
});

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onClose = vi.fn();
  await act(async () => root.render(<DepartureCaptureDialog stint={stint} onClose={onClose} />));
  const save = button('Save reading');
  if (!save) throw new Error('Save action missing');
  return { save, onClose };
}

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
const press = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`Button missing: ${label}`);
  await act(async () => target.click());
};

async function enter(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

async function vouch(value: string) {
  await press('Today');
  await enter('value', value);
  await press('Date looks good');
}

it('saves a departure without a comment', async () => {
  const { save, onClose } = await mount();
  await vouch('131');
  await act(async () => save.click());
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'departure', assignmentId: stint.id, value: 131, comment: null }),
    'Unable to capture departure reading.',
  );
  expect(onClose).toHaveBeenCalled();
});

it('shows a refused capture inside the dialog and stays open', async () => {
  capture.mockRejectedValueOnce(new Error('This Machine Assignment is not on site.'));
  const { save, onClose } = await mount();
  await vouch('131');
  await act(async () => save.click());
  const alert = [...document.querySelectorAll('[role="alert"]')].find((item) =>
    item.textContent?.includes('This Machine Assignment is not on site.'),
  );
  expect(alert).toBeDefined();
  expect(onClose).not.toHaveBeenCalled();
  // The ledger may have moved: the dialog judges the retry against a fresh latest.
  expect(refetchLatest).toHaveBeenCalledOnce();
});

it('reopens the date on the Read At a refusal proposes, and posts it once confirmed again', async () => {
  latestProvider.current = 'john-deere';
  // Seconds the picker cannot show: the second Save still posts the proposal's own instant.
  const readAt = new Date(2026, 8, 16, 9, 30, 27);
  const floor = { value: 125, capturedAt: new Date(2026, 8, 16, 9, 0).toISOString(), telematicsProvider: null };
  capture.mockRejectedValueOnce(
    new RouteRefusedError(`A reading of ${formatHours(127)} is higher. Check the time or the value.`, {
      appCode: 'reading.below_latest',
      suggestedReadAt: { kind: 'human', readAt: readAt.toISOString(), floor, ceiling: null, overAWeek: false },
    }),
  );
  const { save, onClose } = await mount();
  await vouch('126');
  await act(async () => save.click());
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector('[name="comment"]')).toBeNull();
  expect(button(`Read on ${formatDate(readAt, 'medium')}`)).toBeDefined();
  await press('Date looks good');
  await act(async () => save.click());
  expect(capture).toHaveBeenLastCalledWith(
    expect.objectContaining({ value: 126, capturedAt: readAt.toISOString() }),
    'Unable to capture departure reading.',
  );
});
