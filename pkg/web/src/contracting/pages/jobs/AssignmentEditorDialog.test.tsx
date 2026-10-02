/** @vitest-environment jsdom */

import type { Assignment } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/CreateEntityDialog.js';
import { AssignmentEditorDialog } from './AssignmentEditorDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const stint = {
  id: '00000000-0000-4000-8000-000000000001',
  machineCode: 'BEL14-1',
  categoryIcon: 'tractor',
  categoryColour: 'green',
  implementId: 'implement-1',
  driverUserId: 'driver-1',
} as Assignment;

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function button(label: string) {
  const result = [...document.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
  if (!result) throw new Error(`Button missing: ${label}`);
  return result;
}

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const captureArrival = vi.fn(async () => undefined);
  const applyAssignment = vi.fn(async (_draft: { implementId: string; driverUserId: string }) => undefined);
  await act(async () => {
    root.render(
      <CreateEntityDialog
        open
        title="Capture arrival"
        defaultValues={{ reading: 112.5 }}
        validator={z.object({ reading: z.number() })}
        onOpenChange={() => undefined}
        onCreate={captureArrival}
        onCreated={() => undefined}
      >
        {() => (
          <AssignmentEditorDialog
            stint={stint}
            implementOptions={[
              { value: '', label: 'No implement' },
              { value: 'implement-1', label: 'AFTAPKAR-1' },
              { value: 'implement-2', label: 'AFTAPKAR-2' },
            ]}
            driverOptions={[{ value: 'driver-1', label: 'Andile S' }]}
            onSave={applyAssignment}
            submitLabel="Apply"
          />
        )}
      </CreateEntityDialog>,
    );
  });
  await act(async () => button('Edit implement and driver for BEL14-1').click());
  return { captureArrival, applyAssignment };
}

async function chooseImplement(code: string) {
  const input = [...document.querySelectorAll<HTMLInputElement>('input')].find(
    (item) => item.getAttribute('role') === 'combobox' && item.value === 'AFTAPKAR-1',
  );
  if (!input) throw new Error('Implement combobox missing');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, code);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent?.trim() === code,
  );
  if (!option) throw new Error(`Implement option missing: ${code}`);
  await act(async () => option.click());
}

it('applies the assignment draft without submitting the parent arrival form', async () => {
  const { captureArrival, applyAssignment } = await mount();
  await chooseImplement('AFTAPKAR-2');
  await act(async () => button('Apply').click());
  expect(applyAssignment).toHaveBeenCalledWith({ implementId: 'implement-2', driverUserId: 'driver-1' });
  expect(captureArrival).not.toHaveBeenCalled();
  await act(async () => button('Save').click());
  expect(captureArrival).toHaveBeenCalledWith({ reading: 112.5 });
});

it('discards cancelled edits and opens again with the current assignment', async () => {
  const { captureArrival, applyAssignment } = await mount();
  await chooseImplement('No implement');
  await act(async () => button('Cancel').click());
  expect(applyAssignment).not.toHaveBeenCalled();
  expect(captureArrival).not.toHaveBeenCalled();
  await act(async () => button('Edit implement and driver for BEL14-1').click());
  expect([...document.querySelectorAll('input')].some((input) => input.value === 'AFTAPKAR-1')).toBe(true);
  expect(button('Apply').disabled).toBe(true);
});
