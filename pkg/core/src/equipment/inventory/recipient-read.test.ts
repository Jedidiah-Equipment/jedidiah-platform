import { user } from '@pkg/db';
import type { ContractingRole, EquipmentRole } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { test } from '../test/inventory-fixtures.js';
import { listInventoryRecipients, listMovementOperators } from './recipient-read.js';

const now = new Date('2026-08-01T08:00:00.000Z');

function person(
  id: string,
  {
    banned = false,
    contractingRole = null,
    isDevice = false,
    role = null,
  }: { banned?: boolean; contractingRole?: ContractingRole | null; isDevice?: boolean; role?: EquipmentRole | null },
) {
  return {
    banned,
    contractingRole,
    createdAt: now,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    isDevice,
    name: `Ayanda ${id}`,
    role,
    updatedAt: now,
  };
}

const people = [
  person('bay-operator', { role: 'bay-operator' }),
  person('driver', { contractingRole: 'driver' }),
  person('mechanic', { contractingRole: 'mechanic' }),
  person('stores-and-driver', { contractingRole: 'driver', role: 'stores' }),
  person('foreman', { contractingRole: 'foreman' }),
  person('workshop-manager', { contractingRole: 'workshop-manager' }),
  person('banned-driver', { banned: true, contractingRole: 'driver' }),
  person('device', { isDevice: true, role: 'stores' }),
  person('no-role', {}),
];

describe('listInventoryRecipients', () => {
  test('offers active Equipment people, Drivers and Mechanics, naming the role only for Contracting-only people', async ({
    context,
  }) => {
    await context.db.insert(user).values(people);

    const result = await listInventoryRecipients({ db: context.db, input: { cursor: 0, limit: 0, search: 'Ayanda' } });

    expect(result.total).toBe(4);
    expect(result.items.map(({ contractingRole, id }) => ({ contractingRole, id }))).toEqual([
      { contractingRole: null, id: 'bay-operator' },
      { contractingRole: 'driver', id: 'driver' },
      { contractingRole: 'mechanic', id: 'mechanic' },
      { contractingRole: null, id: 'stores-and-driver' },
    ]);
  });
});

describe('listMovementOperators', () => {
  test('offers only active Equipment people, never a Driver or Mechanic', async ({ context }) => {
    await context.db.insert(user).values(people);

    await expect(
      listMovementOperators({ db: context.db, input: { cursor: 0, limit: 0, search: 'Ayanda' } }),
    ).resolves.toEqual({
      items: [
        { id: 'bay-operator', name: 'Ayanda bay-operator', thumbnailDataUrl: null },
        { id: 'stores-and-driver', name: 'Ayanda stores-and-driver', thumbnailDataUrl: null },
      ],
      nextCursor: null,
      total: 2,
    });
  });
});
