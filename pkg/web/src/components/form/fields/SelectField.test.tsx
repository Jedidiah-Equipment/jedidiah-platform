// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAppForm } from '../hooks/use-app-form.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe('SelectField', () => {
  it('displays a disabled selection while offering only the enabled options', async () => {
    let readSalesperson = () => '';
    function Form() {
      const form = useAppForm({ defaultValues: { salesPersonId: 'former-id' } });
      readSalesperson = () => form.state.values.salesPersonId;
      return (
        <form.AppField name="salesPersonId">
          {(field) => (
            <field.SelectField
              label="Salesperson"
              options={[
                { label: 'Current Seller', value: 'current-id' },
                { disabled: true, label: 'Former Seller', value: 'former-id' },
              ]}
            />
          )}
        </form.AppField>
      );
    }

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Form />));

    const trigger = container.querySelector<HTMLElement>('[data-slot="select-trigger"]');
    expect(trigger?.textContent).toContain('Former Seller');
    await act(async () => trigger?.click());

    await vi.waitFor(() => expect(document.querySelectorAll('[data-slot="select-item"]')).toHaveLength(2));
    const [current, former] = document.querySelectorAll<HTMLElement>('[data-slot="select-item"]');
    expect(former?.hasAttribute('data-disabled')).toBe(true);
    await act(async () => current?.click());
    expect(readSalesperson()).toBe('current-id');
    expect(trigger?.textContent).toContain('Current Seller');
  });
});
