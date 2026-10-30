/** @vitest-environment jsdom */

import { formatDate, formatHours } from '@pkg/domain';
import { captureRefusals } from '@pkg/domain/contracting';
import type { Machine, ReadAtEstimate } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
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
const estimates = vi.hoisted(() => ({ for: (_value: number | null): ReadAtEstimate | undefined => ({ kind: 'now' }) }));
vi.mock('@/contracting/components/readings/use-read-at-estimate.js', () => ({
  useReadAtEstimate: (_target: unknown, value: number | null) => ({
    estimate: value === null ? undefined : estimates.for(value),
    working: false,
    error: null,
    refetch: async () => undefined,
  }),
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: async () => undefined, invalidateReadings: async () => undefined }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const machine: Pick<Machine, 'id' | 'code' | 'categoryIcon' | 'categoryColour'> = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'BEL315-1',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
};

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  capture.mockClear();
  estimates.for = () => ({ kind: 'now' });
});

const estimated = (kind: 'telematics' | 'human', readAt: Date): ReadAtEstimate => ({
  kind,
  readAt: readAt.toISOString() as never,
  floor: {
    value: 120,
    capturedAt: readAt.toISOString() as never,
    telematicsProvider: kind === 'telematics' ? 'john-deere' : null,
  },
  ceiling: null,
  overAWeek: false,
});
const deere = (readAt: Date) => estimated('telematics', readAt);
const guess = (readAt: Date) => estimated('human', readAt);

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onClose = vi.fn();
  await act(async () => root.render(<SpotCaptureDialog machine={machine} onClose={onClose} />));
  return { onClose };
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

it('opens on the question alone, then reveals hours, the date and the details in turn', async () => {
  await mount();
  expect(document.body.textContent).toContain('When was the meter read?');
  expect(document.querySelector('[name="value"]')).toBeNull();
  expect(button('Today')?.getAttribute('aria-pressed')).toBe('false');
  await press('Today');
  expect(document.querySelector('[name="value"]')).not.toBeNull();
  expect(button('Date looks good')).toBeUndefined();
  await enter('value', '140');
  expect(document.body.textContent).toContain('Read now');
  expect(document.querySelector('[name="comment"]')).toBeNull();
  expect(button('Save reading')).toBeUndefined();
  await press('Date looks good');
  expect(document.querySelector('[name="comment"]')).not.toBeNull();
  await enter('comment', 'Gate open');
  await press('Save reading');
  expect(capture.mock.calls[0]?.[0]).toMatchObject({
    role: 'spot',
    machineId: machine.id,
    value: 140,
    comment: 'Gate open',
    disputePrevious: false,
    expectedPreviousId: latestId,
  });
});

it('stops at the hours with the sentence when the meter cannot have got there', async () => {
  estimates.for = () => ({ kind: 'impossible', sentence: 'The meter cannot have reached 165.0 h yet.' });
  await mount();
  await press('Today');
  await enter('value', '165');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('The meter cannot have reached 165.0 h yet.');
  expect(button('Date looks good')).toBeUndefined();
});

it('locks a date John Deere brackets and posts it to the second', async () => {
  const readAt = new Date(2026, 9, 16, 9, 30, 27);
  estimates.for = () => deere(readAt);
  await mount();
  await press('Earlier');
  await enter('value', '126');
  expect(document.body.textContent).toContain(`Read on ${formatDate(readAt, 'medium')} per John Deere`);
  expect(document.querySelector('[name="readAt"]')).toBeNull();
  await press('Date looks good');
  await press('Save reading');
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ value: 126, capturedAt: readAt.toISOString() });
});

it('warns under Today when the guessed date is another day, and lets the person correct it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0));
  try {
    estimates.for = () => guess(new Date(2026, 9, 18, 8, 0));
    await mount();
    await press('Today');
    await enter('value', '135');
    expect(document.body.textContent).toContain(
      `This reading looks like it was read on ${formatDate(new Date(2026, 9, 18), 'short')}, not today.`,
    );
    await press(`Read about ${formatDate(new Date(2026, 9, 18, 8, 0), 'medium')}`);
    await enterReadAt('2026-10-20', '09:30');
    expect(document.body.textContent).not.toContain('not today');
    await press('Date looks good');
    await press('Save reading');
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ capturedAt: new Date(2026, 9, 20, 9, 30).toISOString() });
  } finally {
    vi.useRealTimers();
  }
});

it('keeps a wrong time on screen and holds Date looks good until it is fixed', async () => {
  await mount();
  await press('Earlier');
  await enter('value', '140');
  await enterReadAt('2026-10-20', '25:00');
  expect(document.querySelector<HTMLInputElement>('[name="readAt-time"]')?.value).toBe('25:00');
  expect(document.body.textContent).toContain('Enter the time as HH:mm');
  expect(button('Date looks good')?.disabled).toBe(true);
});

it('offers the dispute below a human latest, which posts the handshake', async () => {
  estimates.for = () => guess(new Date('2026-10-17T10:00:00.000Z'));
  await mount();
  await press('Today');
  await enter('value', '126');
  expect(document.body.textContent).toContain(
    `This is below the latest reading of ${formatHours(130)} at ${formatDate(new Date('2026-10-17T12:00:00.000Z'), 'medium')}.`,
  );
  expect(button('Date looks good')?.disabled).toBe(true);
  await press('The previous reading is wrong');
  await press('Date looks good');
  await press('Save reading');
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'spot', value: 126, disputePrevious: true, expectedPreviousId: latestId }),
    'Unable to capture the reading.',
  );
});

it('reads earlier at the guessed date from the dispute fork', async () => {
  const readAt = new Date('2026-10-17T10:00:00.000Z');
  estimates.for = () => guess(readAt);
  await mount();
  await press('Earlier');
  await enter('value', '126');
  await press('Read earlier');
  expect(document.body.textContent).not.toContain('This is below the latest reading');
  await press('Date looks good');
  await press('Save reading');
  expect(capture.mock.calls[0]?.[0]).toMatchObject({ disputePrevious: false, capturedAt: readAt.toISOString() });
});

it('refuses a Read At still to come', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0));
  try {
    await mount();
    await press('Earlier');
    await enter('value', '140');
    await enterReadAt('2026-10-20', '18:00');
    expect(document.body.textContent).toContain(captureRefusals['future-read-at'].message);
    expect(button('Date looks good')?.disabled).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
