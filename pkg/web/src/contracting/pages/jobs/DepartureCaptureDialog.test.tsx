/** @vitest-environment jsdom */

import { createUserAccessSummary } from '@pkg/domain';
import type { Assignment } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';

const capture = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('./capture-reading.js', () => ({ captureReading: capture }));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: async () => undefined, invalidateReadings: async () => undefined }),
}));
const manager = createUserAccessSummary({
  userId: 'manager',
  equipmentRole: null,
  contractingRole: 'contracting-manager',
});
const foreman = createUserAccessSummary({ userId: 'foreman', equipmentRole: null, contractingRole: 'foreman' });
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
  categoryColour: 'green',
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

it('requires a photo-less departure reason and submits the shared reading field value', async () => {
  const { save, onClose } = await mount();
  await enter('value', '125.5');
  expect(save.disabled).toBe(false);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await act(async () => save.click());
  const error = document.querySelector('[role="alert"]');
  expect(error?.textContent).toContain('A photo or a reason is required');
  expect(error?.classList.contains('text-destructive')).toBe(true);
  expect(capture).not.toHaveBeenCalled();
  expect(save.disabled).toBe(false);
  await enter('reason', '   ');
  await act(async () => save.click());
  expect(capture).not.toHaveBeenCalled();
  await enter('reason', 'Camera unavailable');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      assignmentId: stint.id,
      machineId: stint.machineId,
      role: 'departure',
      value: 125.5,
      comment: 'Camera unavailable',
      capturedAt: expect.any(String),
    }),
    null,
    'Unable to capture departure reading.',
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it('allows a departure with a meter photo and no reason', async () => {
  const { save } = await mount();
  await enter('value', '126');
  const photo = new File(['meter'], 'meter.jpg', { type: 'image/jpeg' });
  await selectPhoto(photo);
  expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:http://localhost/meter.jpg');
  await act(async () => button('Enlarge meter photo').click());
  const enlarged = document.querySelector('img[alt="Enlarged meter photo"]');
  expect(enlarged?.getAttribute('src')).toBe('blob:http://localhost/meter.jpg');
  expect(capture).not.toHaveBeenCalled();
  const closePreview = enlarged
    ?.closest('[role="dialog"]')
    ?.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
  if (!closePreview) throw new Error('Preview close action missing');
  await act(async () => closePreview.click());
  expect(capture).not.toHaveBeenCalled();
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'departure', value: 126, comment: null }),
    photo,
    'Unable to capture departure reading.',
  );
});

it('lets a Foreman save a photo-less departure without a reason', async () => {
  access.current = foreman;
  const { save } = await mount();
  await enter('value', '126');
  await act(async () => save.click());
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'departure', value: 126, comment: null }),
    null,
    'Unable to capture departure reading.',
  );
});

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
  await enter('value', '126');
  await enter('reason', 'Camera unavailable');
  await act(async () => save.click());
  const alert = [...document.querySelectorAll('[role="alert"]')].find((item) =>
    item.textContent?.includes('This Machine Assignment is not on site.'),
  );
  expect(alert).toBeDefined();
  expect(onClose).not.toHaveBeenCalled();
});
