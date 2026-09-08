// @vitest-environment jsdom

import { AuthId } from '@pkg/schema';
import type { UserSummary } from '@pkg/schema/equipment';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { UserNameCell, UserTable, useUserTableStore } from './UserTable.js';

const users: UserSummary[] = [
  makeUser('Alice', 'sales', null),
  makeUser('Ben', null, 'foreman'),
  makeUser('Cara', 'sales', 'contracting-invoicing'),
  makeUser('Dan', null, 'driver'),
  makeUser('Eve', null, 'mechanic'),
  makeUser('Finn', 'bay-operator', null),
  makeUser('Grace', 'super-admin', null),
  makeUser('Hope', null, null),
  makeUser('Ivan', 'bay-operator', 'driver'),
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

describe('UserTable business mode', () => {
  it('derives mode from role presence, including permissionless roles and spanning super-admins', async () => {
    await mountUsers();
    const headers = [...container.querySelectorAll('thead th')];
    const modeIndex = headers.findIndex((header) => header.textContent === 'Mode');
    expect(modeIndex).toBeGreaterThanOrEqual(0);
    expect(
      [...container.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[modeIndex]?.textContent),
    ).toEqual([
      'Equipment',
      'Contracting',
      'Both',
      'Contracting',
      'Contracting',
      'Equipment',
      'Both',
      'No access',
      'Both',
    ]);
  });

  it('filters by the displayed mode and restores all users when cleared', async () => {
    await mountUsers();
    await click('[aria-label="Filter Mode"]');
    for (const [mode, names] of [
      ['Contracting', ['Ben', 'Dan', 'Eve']],
      ['Equipment', ['Alice', 'Finn']],
      ['Both', ['Cara', 'Grace', 'Ivan']],
      ['No access', ['Hope']],
    ] as const) {
      await click('[role="combobox"][aria-label="Filter Mode"]');
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (element) => element.textContent === mode,
      );
      expect(option).toBeDefined();
      await act(async () => option?.click());
      expect(
        [...container.querySelectorAll('tbody tr')].map((row) => row.getAttribute('aria-label')?.replace('Edit ', '')),
      ).toEqual(names);
    }
    await click('[aria-label="Clear Mode filter"]');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(users.length);
  });
});

async function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  await act(async () => element?.click());
}

async function mountUsers() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <UserTable
        currentUserId={undefined}
        errorMessage={undefined}
        isLoading={false}
        onEditUser={() => undefined}
        users={users}
      />,
    );
  });
}

function makeUser(
  name: string,
  equipmentRole: UserSummary['equipmentRole'],
  contractingRole: UserSummary['contractingRole'],
): UserSummary {
  return {
    assistantEnabled: false,
    departments: [],
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

describe('UserNameCell', () => {
  it('keeps the device marker on the same small footprint as user thumbnails', () => {
    const html = renderToStaticMarkup(
      <UserNameCell isCurrentUser={false} isDevice name="Stores Tablet" thumbnailDataUrl={null} />,
    );

    expect(html).toContain('size-6');
    expect(html).toContain('width="14"');
    expect(html).toContain('height="14"');
  });
});
