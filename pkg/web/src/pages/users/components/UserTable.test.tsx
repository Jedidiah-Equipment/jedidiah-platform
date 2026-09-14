// @vitest-environment jsdom

import { AuthId, type Business, type UserAccount } from '@pkg/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { UserTable, useUserTableStore } from './UserTable.js';

const users: UserAccount[] = [
  makeUser('Alice', 'sales', null),
  makeUser('Ben', null, 'foreman'),
  makeUser('Cara', 'sales', 'contracting-invoicing'),
  makeUser('Grace', 'super-admin', null),
  makeUser('Hope', null, null),
];

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  useUserTableStore.getState().reset();
});

describe('UserTable role column', () => {
  it('shows one Role column holding the role for the business the table stands in', async () => {
    await mountUsers('equipment');

    expect(headerTexts()).toEqual(['Full Name', 'Role', 'Email status']);
    expect(columnTexts('Role')).toEqual(['Sales', 'No access', 'Sales', 'Super Administrator', 'No access']);
  });

  it('reads a super-admin as the contracting role it spans into', async () => {
    await mountUsers('contracting');

    expect(columnTexts('Role')).toEqual([
      'No access',
      'Foreman',
      'Contracting Invoicing',
      'Super Administrator',
      'No access',
    ]);
  });

  it('places a business extension column between the role and the email status', async () => {
    await mountUsers('equipment', [{ accessorFn: (user) => `${user.name} extra`, header: 'Extra', id: 'extra' }]);

    expect(headerTexts()).toEqual(['Full Name', 'Role', 'Extra', 'Email status']);
    expect(columnTexts('Extra')[0]).toBe('Alice extra');
  });
});

function headerTexts() {
  return [...container.querySelectorAll('thead th')].map((header) => header.textContent);
}

function columnTexts(header: string) {
  const index = headerTexts().indexOf(header);
  expect(index).toBeGreaterThanOrEqual(0);

  return [...container.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[index]?.textContent);
}

async function mountUsers(
  business: Business,
  extraColumns: React.ComponentProps<typeof UserTable>['extraColumns'] = [],
) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <UserTable
        business={business}
        currentUserId={undefined}
        errorMessage={undefined}
        extraColumns={extraColumns}
        extraSearchTerms={() => []}
        isLoading={false}
        onEditUser={() => undefined}
        users={users}
      />,
    );
  });
}

function makeUser(
  name: string,
  equipmentRole: UserAccount['equipmentRole'],
  contractingRole: UserAccount['contractingRole'],
): UserAccount {
  return {
    assistantEnabled: false,
    emailVerified: true,
    id: AuthId.parse(name),
    isDevice: false,
    name,
    email: `${name.toLowerCase()}@example.com`,
    phoneNumber: null,
    equipmentRole,
    contractingRole,
    thumbnailDataUrl: null,
  };
}
