/** @vitest-environment jsdom */

import type { Assignment } from '@pkg/schema/contracting';
import { act, type ComponentProps } from 'react';
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

function editorButton(label: string) {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) =>
    item.textContent?.includes('Edit assignment'),
  );
  const result = [...(dialog?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`Editor button missing: ${label}`);
  return result;
}

type EditorProps = Partial<ComponentProps<typeof AssignmentEditorDialog>>;

async function mount(props: EditorProps = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const captureArrival = vi.fn(async () => undefined);
  const applyAssignment = vi.fn(async (_draft: { implementId: string; driverUserId: string }) => undefined);
  const render = (overrides: EditorProps = {}) =>
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
            {...props}
            {...overrides}
          />
        )}
      </CreateEntityDialog>,
    );
  await act(async () => render());
  await act(async () => button('Edit implement and driver for BEL14-1').click());
  return { captureArrival, applyAssignment, rerender: (overrides: EditorProps) => act(async () => render(overrides)) };
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
  await act(async () => editorButton('Apply').click());
  expect(applyAssignment).toHaveBeenCalledWith({ implementId: 'implement-2', driverUserId: 'driver-1' });
  expect(captureArrival).not.toHaveBeenCalled();
  await act(async () => button('Save').click());
  expect(captureArrival).toHaveBeenCalledWith({ reading: 112.5 });
});

it('discards cancelled edits and opens again with the current assignment', async () => {
  const { captureArrival, applyAssignment } = await mount();
  await chooseImplement('No implement');
  await act(async () => editorButton('Cancel').click());
  expect(applyAssignment).not.toHaveBeenCalled();
  expect(captureArrival).not.toHaveBeenCalled();
  await act(async () => button('Edit implement and driver for BEL14-1').click());
  expect([...document.querySelectorAll('input')].some((input) => input.value === 'AFTAPKAR-1')).toBe(true);
  expect(editorButton('Apply').disabled).toBe(true);
});

it('keeps the submit disabled until the pick lists are ready', async () => {
  await mount({ canSave: false });
  await chooseImplement('AFTAPKAR-2');
  expect(editorButton('Apply').disabled).toBe(true);
});

it('shows a refused save inside the dialog and keeps the draft', async () => {
  const onSave = vi.fn(async () => {
    throw new Error('Implement is on site on another Job');
  });
  const { rerender } = await mount({ onSave });
  await chooseImplement('AFTAPKAR-2');
  await act(async () => editorButton('Apply').click());
  expect(onSave).toHaveBeenCalledOnce();
  await rerender({ onSave, error: new Error('Implement is on site on another Job') });
  const editor = [...document.querySelectorAll('[role="dialog"]')].find((item) =>
    item.textContent?.includes('Edit assignment'),
  );
  expect(editor?.textContent).toContain('Implement is on site on another Job');
  expect([...(editor?.querySelectorAll('input') ?? [])].some((input) => input.value === 'AFTAPKAR-2')).toBe(true);
});
