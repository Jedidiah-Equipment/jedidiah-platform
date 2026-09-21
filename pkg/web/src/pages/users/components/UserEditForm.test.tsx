// @vitest-environment jsdom

import { AuthId, type UserAccount } from '@pkg/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserEditForm } from './UserEditForm.js';

const user: UserAccount = {
  assistantEnabled: false,
  contractingRole: null,
  email: 'sales@example.com',
  emailVerified: true,
  equipmentRole: 'sales',
  id: AuthId.parse('sales-id'),
  isDevice: false,
  name: 'Sales User',
  phoneNumber: null,
  quoteSalesperson: true,
  thumbnailDataUrl: null,
};

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
});

describe('UserEditForm', () => {
  it('submits a changed Quote salesperson flag in Equipment mode while Contracting has no control', async () => {
    const onSubmit = vi.fn(async () => undefined);
    await mount('equipment', onSubmit);

    const checkbox = container.querySelector<HTMLElement>('[name="quoteSalesperson"]');
    expect(checkbox).not.toBeNull();
    await act(async () => checkbox?.click());
    await act(async () => container.querySelector<HTMLFormElement>('form#edit-user')?.requestSubmit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ quoteSalesperson: false }));

    await mount(
      'contracting',
      vi.fn(async () => undefined),
    );
    expect(container.querySelector('[name="quoteSalesperson"]')).toBeNull();
  });
});

async function mount(business: 'equipment' | 'contracting', onSubmit: (value: unknown) => Promise<unknown>) {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () =>
    root?.render(
      <UserEditForm
        business={business}
        canSetEmail={false}
        canSetPassword={false}
        canSetRole={false}
        canUpdateProfile
        extraFields={null}
        formId="edit-user"
        initialUser={user}
        isPasswordPending={false}
        isPending={false}
        onPasswordSubmit={vi.fn()}
        onSubmit={onSubmit}
      />,
    ),
  );
}
