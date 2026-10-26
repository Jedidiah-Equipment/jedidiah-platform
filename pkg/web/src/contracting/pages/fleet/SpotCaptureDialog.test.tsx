/** @vitest-environment jsdom */

import { createUserAccessSummary, formatHours } from '@pkg/domain';
import { captureRefusals } from '@pkg/domain/contracting';
import type { Machine } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SpotCaptureDialog } from './SpotCaptureDialog.js';

const capture = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('@/contracting/components/readings/capture-reading.js', () => ({ captureReading: capture }));
const latestId = '00000000-0000-4000-8000-000000000009';
vi.mock('@/contracting/components/readings/use-latest-reading.js', () => ({
  useLatestReading: () => ({
    refetch: async () => undefined,
    isSuccess: true,
    isPending: false,
    error: null,
    data: { id: latestId, role: 'departure', value: 130, capturedAt: '2026-10-17T12:00:00.000Z' },
  }),
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: async () => undefined, invalidateReadings: async () => undefined }),
}));
const access = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/use-access.js', async () => {
  const { hasPermission } = await import('@pkg/domain');
  return {
    useCan: (permission: Parameters<typeof hasPermission>[1]) => ({
      can: hasPermission(access.current as Parameters<typeof hasPermission>[0], permission),
    }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const machine: Pick<Machine, 'id' | 'code' | 'categoryIcon' | 'categoryColour'> = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'BEL315-1',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
};

beforeEach(() => {
  access.current = createUserAccessSummary({
    userId: 'manager',
    equipmentRole: null,
    contractingRole: 'contracting-manager',
  });
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  capture.mockClear();
});

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onClose = vi.fn();
  await act(async () => root.render(<SpotCaptureDialog machine={machine} onClose={onClose} />));
  const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Capture');
  if (!save) throw new Error('Capture action missing');
  return { save, onClose };
}

async function enter(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

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

it('posts a spot reading for the Machine, on no Assignment, read when the meter was read', async () => {
  const { save, onClose } = await mount();
  await enter('value', '140');
  await enterReadAt('2026-10-20', '09:30');
  await act(async () => save.click());

  expect(capture).toHaveBeenCalledOnce();
  const [fields, photo] = capture.mock.calls[0] ?? [];
  expect(fields).toEqual({
    role: 'spot',
    machineId: machine.id,
    value: 140,
    comment: null,
    disputePrevious: false,
    expectedPreviousId: latestId,
    capturedAt: new Date(2026, 9, 20, 9, 30).toISOString(),
  });
  expect(photo).toBeNull();
  expect(onClose).toHaveBeenCalled();
});

it('captures a time typed without leaving the time box', async () => {
  const { save } = await mount();
  await enter('value', '140');
  await enterReadAt('2026-10-20', '09:30');
  await enter('readAt-time', '10:15');
  await act(async () => save.click());

  expect(capture.mock.calls[0]?.[0]).toMatchObject({ capturedAt: new Date(2026, 9, 20, 10, 15).toISOString() });
});

it('keeps a wrong time on screen and refuses to capture until it is fixed', async () => {
  const { save } = await mount();
  await enter('value', '140');
  await enterReadAt('2026-10-20', '25:00');

  expect(document.querySelector<HTMLInputElement>('[name="readAt-time"]')?.value).toBe('25:00');
  expect(document.body.textContent).toContain('Enter the time as HH:mm');
  expect(save.disabled).toBe(true);
  expect(capture).not.toHaveBeenCalled();
});

it('offers the dispute for a reading below the latest one', async () => {
  const { save } = await mount();
  await enter('value', '126');
  await act(async () => document.querySelector<HTMLTextAreaElement>('[name="comment"]')?.focus());
  expect(document.body.textContent).toContain(
    `Record ${formatHours(126)} and dispute the ${formatHours(130)} reading.`,
  );
  expect(save.disabled).toBe(true);
  const dispute = document.querySelector<HTMLElement>('#confirmedDispute');
  if (!dispute) throw new Error('Dispute checkbox missing');
  await act(async () => dispute.click());
  await act(async () => save.click());
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'spot', value: 126, disputePrevious: true, expectedPreviousId: latestId }),
    null,
    'Unable to capture the reading.',
  );
});

it('refuses a Read At still to come', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0));
  try {
    const { save } = await mount();
    await enter('value', '140');
    await enterReadAt('2026-10-20', '18:00');
    expect(document.body.textContent).toContain(captureRefusals['future-read-at'].message);
    expect(save.disabled).toBe(true);
    expect(capture).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
