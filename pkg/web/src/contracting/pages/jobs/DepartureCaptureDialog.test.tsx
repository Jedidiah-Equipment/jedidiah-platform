/** @vitest-environment jsdom */

import { createUserAccessSummary, formatDate, formatHours } from '@pkg/domain';
import type { Assignment } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MultipartRefusedError } from '@/contracting/lib/post-multipart.js';
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
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: async () => undefined, invalidateReadings: async () => undefined }),
}));
const manager = createUserAccessSummary({
  userId: 'manager',
  equipmentRole: null,
  contractingRole: 'contracting-manager',
});
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
const stint = {
  id: '00000000-0000-4000-8000-000000000001',
  machineId: '00000000-0000-4000-8000-000000000002',
  machineCode: 'BEL14-1',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
  arrival: { value: 120 },
} as Assignment;

beforeEach(() => {
  access.current = manager;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:http://localhost/${(blob as File).name}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

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
  const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save');
  if (!save) throw new Error('Save action missing');
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
  const earlier = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Earlier…');
  if (earlier?.getAttribute('aria-pressed') === 'false') await act(async () => earlier.click());
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

function button(label: string) {
  const result = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label);
  if (!result) throw new Error(`Button missing: ${label}`);
  return result;
}

async function selectPhoto(photo: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Meter photo picker missing');
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [photo] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('updates the preview on replacement and restores the evidence error on removal', async () => {
  const { save } = await mount();
  await enter('value', '131');
  await act(async () => save.click());
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  await selectPhoto(new File(['meter'], 'first.jpg', { type: 'image/jpeg' }));
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await selectPhoto(new File(['replacement'], 'second.png', { type: 'image/png' }));
  expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:http://localhost/second.png');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/first.jpg');
  await act(async () => button('Remove meter photo').click());
  expect(document.querySelector('img')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/second.png');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('A photo or a reason is required');
  expect(save.disabled).toBe(false);
  expect(capture).not.toHaveBeenCalled();
});

it('keeps Save enabled for invalid readings and presents field validation on submit', async () => {
  const { save } = await mount();
  await enter('value', '');
  await enter('reason', 'Camera unavailable');
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(capture).not.toHaveBeenCalled();
  expect(document.querySelector('[name="value"]')?.getAttribute('aria-invalid')).toBe('true');
  expect(save.disabled).toBe(false);
});

it('shows a refused capture inside the dialog and stays open', async () => {
  capture.mockRejectedValueOnce(new Error('This Machine Assignment is not on site.'));
  const { save, onClose } = await mount();
  await enter('value', '131');
  await enter('reason', 'Camera unavailable');
  await act(async () => save.click());
  const alert = [...document.querySelectorAll('[role="alert"]')].find((item) =>
    item.textContent?.includes('This Machine Assignment is not on site.'),
  );
  expect(alert).toBeDefined();
  expect(onClose).not.toHaveBeenCalled();
  // The ledger may have moved: the dialog judges the retry against a fresh latest.
  expect(refetchLatest).toHaveBeenCalledOnce();
});

it('offers the dispute for a departure below the latest reading and posts the handshake', async () => {
  const { save } = await mount();
  await enter('value', '126');
  // The warning waits for the reading to lose focus, as it does when the person moves on to the reason.
  await act(async () => document.querySelector<HTMLTextAreaElement>('[name="reason"]')?.focus());
  await enter('reason', 'Camera unavailable');
  expect(document.body.textContent).toContain(
    `Record ${formatHours(126)} and dispute the ${formatHours(130)} reading.`,
  );
  expect(save.disabled).toBe(true);
  const dispute = document.querySelector<HTMLElement>('#confirmedDispute');
  if (!dispute) throw new Error('Dispute checkbox missing');
  await act(async () => dispute.click());
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      role: 'departure',
      value: 126,
      comment: 'Camera unavailable',
      disputePrevious: true,
      expectedPreviousId: latestId,
    }),
    null,
    'Unable to capture departure reading.',
  );
});

it('posts a departure read before the latest reading, leaving its neighbours to the server', async () => {
  const { save } = await mount();
  await enter('value', '126');
  await enterReadAt('2026-09-16', '16:00');
  await act(async () => document.querySelector<HTMLTextAreaElement>('[name="reason"]')?.focus());
  await enter('reason', 'Entered a day late');
  expect(document.querySelector('#confirmedDispute')).toBeNull();
  await act(async () => save.click());
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      role: 'departure',
      value: 126,
      disputePrevious: false,
      capturedAt: new Date(2026, 8, 16, 16, 0).toISOString(),
    }),
    null,
    'Unable to capture departure reading.',
  );
});

it('offers only Read earlier… below a John Deere latest, and lets the server answer the value', async () => {
  latestProvider.current = 'john-deere';
  const { save } = await mount();
  await enter('value', '126');
  await act(async () => document.querySelector<HTMLTextAreaElement>('[name="reason"]')?.focus());
  await enter('reason', 'Entered a day late');
  expect(document.body.textContent).toContain(
    `Below John Deere's ${formatHours(130)} at ${formatDate(new Date('2026-09-17T12:00:00.000Z'), 'medium')}.`,
  );
  expect(document.querySelector('#confirmedDispute')).toBeNull();
  expect(save.disabled).toBe(false);
  const readEarlier = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Read earlier…');
  await act(async () => readEarlier?.click());
  expect(document.querySelector('[name="readAt"]')).not.toBeNull();
  // Earlier… with no time picked yet posts nothing.
  expect(save.disabled).toBe(true);
});

it('proposes the Read At John Deere puts a refused value at, and posts it on the second Save', async () => {
  // Seconds the picker cannot show: the second Save still posts the proposal's own instant.
  const readAt = new Date(2026, 8, 16, 9, 30, 27);
  const floor = { value: 125, capturedAt: new Date(2026, 8, 16, 9, 0).toISOString(), telematicsProvider: 'john-deere' };
  const ceiling = {
    value: 127,
    capturedAt: new Date(2026, 8, 16, 10, 0).toISOString(),
    telematicsProvider: 'john-deere',
  };
  capture.mockRejectedValueOnce(
    new MultipartRefusedError(`John Deere reported ${formatHours(127)}. Check the time or the value.`, {
      appCode: 'reading.below_latest',
      suggestedReadAt: { readAt: readAt.toISOString(), floor, ceiling },
    }),
  );
  const { save, onClose } = await mount();
  await enter('value', '131');
  await enter('reason', 'Entered a day late');
  await act(async () => save.click());
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>('[name="readAt-time"]')?.value).toBe('09:30');
  expect(document.body.textContent).toContain(
    `John Deere puts this reading between ${formatDate(new Date(floor.capturedAt), 'medium')} and ${formatDate(new Date(ceiling.capturedAt), 'medium')}.`,
  );
  await act(async () => save.click());
  expect(capture).toHaveBeenLastCalledWith(
    expect.objectContaining({ value: 131, capturedAt: readAt.toISOString() }),
    null,
    'Unable to capture departure reading.',
  );
});
