/** @vitest-environment jsdom */

import type { ServiceRecord } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { formatNumberFieldValue } from '@/components/form/fields/NumberField.js';
import { CloseServiceRecordDialog } from './CloseServiceRecordDialog.js';

const close = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateServices: async () => undefined }),
}));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ contractingServices: { close: { mutationOptions: (options: unknown) => options } } }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useMutation: () => ({ mutateAsync: close, reset: () => undefined, error: null }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const record = {
  id: '00000000-0000-4000-8000-000000000001',
  machineCode: 'JD6140M-2',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
  primaryMechanicUserId: null,
  mechanicName: null,
  notes: null,
} as ServiceRecord;

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  close.mockClear();
});

async function mount(serviceIntervalHours: number | null, knownHours: number | null = null) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <CloseServiceRecordDialog
        record={record}
        machine={{ knownHours, serviceIntervalHours }}
        mechanicOptions={[]}
        onClose={vi.fn()}
      />,
    ),
  );
  const submit = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Close service',
  );
  if (!submit) throw new Error('Close service action missing');
  return { submit };
}

function field(name: string) {
  const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  return input;
}

async function enter(name: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field(name), value);
    field(name).dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

it('pre-fills Next Service Due from the interval until it is typed over', async () => {
  await mount(250);
  await enter('readingAtServiceHours', '1450');
  expect(field('nextServiceDueHours').value).toBe(formatNumberFieldValue(1700, 2));
  await enter('nextServiceDueHours', '1650');
  await enter('readingAtServiceHours', '1460');
  expect(field('nextServiceDueHours').value).toBe('1650');
});

it('opens on Known Hours as the reading, and the Next Service Due they suggest, both still editable', async () => {
  const { submit } = await mount(250, 7251);
  expect(field('readingAtServiceHours').value).toBe(formatNumberFieldValue(7251, 2));
  expect(field('nextServiceDueHours').value).toBe(formatNumberFieldValue(7501, 2));
  await enter('readingAtServiceHours', '7260');
  expect(field('nextServiceDueHours').value).toBe(formatNumberFieldValue(7510, 2));
  await act(async () => submit.click());
  expect(close).toHaveBeenCalledWith(
    expect.objectContaining({ id: record.id, readingAtServiceHours: 7260, nextServiceDueHours: 7510 }),
  );
});

it('will not close without a Next Service Due', async () => {
  const { submit } = await mount(null);
  await enter('readingAtServiceHours', '1450');
  expect(field('nextServiceDueHours').value).toBe('');
  await act(async () => submit.click());
  expect(close).not.toHaveBeenCalled();
  expect(field('nextServiceDueHours').getAttribute('aria-invalid')).toBe('true');
});
