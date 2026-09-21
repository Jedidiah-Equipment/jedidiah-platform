// @vitest-environment jsdom

import { AuthId, type Business, type UserAccount } from '@pkg/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserTable, userTableStores } from './UserTable.js';

const users: UserAccount[] = [
  makeUser('Alice', 'sales', null),
  makeUser('Ben', null, 'foreman'),
  makeUser('Cara', 'sales', 'contracting-invoicing'),
  makeUser('Grace', 'super-admin', null),
  makeUser('Hope', null, null),
];

const fetchNextPage = vi.fn(async () => undefined);
const useListQuery = vi.fn(() => ({
  data: { pages: [{ items: users, total: 10, nextCursor: 5 }] },
  error: null,
  isPending: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  fetchNextPage,
}));

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  vi.clearAllMocks();
  for (const store of Object.values(userTableStores)) store.getState().reset();
});

describe('UserTable role column', () => {
  it('shows one Role column holding the role for the business the table stands in', async () => {
    await mountUsers('equipment');

    expect(headerTexts()).toEqual(['Full Name', 'Role', 'Email status']);
    expect(columnTexts('Role')).toEqual(['Sales', 'No access', 'Sales', 'Super Administrator', 'No access']);
  });

  it('requests the next server page and forwards each business’s independent filters and sort', async () => {
    userTableStores.contracting.getState().setGlobalFilter('Driver');
    userTableStores.contracting.getState().setColumnFilters([{ id: 'role', value: 'Driver' }]);
    userTableStores.contracting.getState().setSorting([{ id: 'name', desc: true }]);
    await mountUsers('contracting');
    expect(useListQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        business: 'contracting',
        limit: 25,
        search: 'Driver',
        sortBy: 'name',
        sortDirection: 'desc',
        columnFilters: { name: undefined, role: 'Driver', emailVerified: undefined },
      }),
      [{ id: 'role', value: 'Driver' }],
    );
    // The server owns row order and filtering; the browser must not re-filter just the loaded page.
    expect([...container.querySelectorAll('tbody tr')].map((row) => row.getAttribute('aria-label'))).toEqual(
      users.map((person) => `Edit ${person.name}`),
    );
    const loadMore = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Load more'),
    );
    expect(loadMore).toBeDefined();
    await act(async () => loadMore?.click());
    expect(fetchNextPage).toHaveBeenCalledOnce();
    expect(userTableStores.equipment.getState().globalFilter).toBe('');
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
});

function headerTexts() {
  return [...container.querySelectorAll('thead th')].map((header) => header.textContent);
}

function columnTexts(header: string) {
  const index = headerTexts().indexOf(header);
  expect(index).toBeGreaterThanOrEqual(0);

  return [...container.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[index]?.textContent);
}

async function mountUsers(business: Business) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <UserTable
        business={business}
        currentUserId={undefined}
        extraColumns={[]}
        onEditUser={() => undefined}
        useListQuery={useListQuery}
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
    quoteSalesperson: false,
    equipmentRole,
    contractingRole,
    thumbnailDataUrl: null,
  };
}
