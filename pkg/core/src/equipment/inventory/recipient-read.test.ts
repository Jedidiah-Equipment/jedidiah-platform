import { user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { test } from '../test/inventory-fixtures.js';
import { listInventoryRecipients } from './recipient-read.js';

describe('listInventoryRecipients', () => {
  test('pages searchable active Equipment people without narrowing to stores', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values([
      {
        createdAt: now,
        email: 'connor@example.com',
        emailVerified: true,
        id: 'connor',
        name: 'Connor Mechanic',
        role: 'bay-operator',
        updatedAt: now,
      },
      {
        banned: true,
        createdAt: now,
        email: 'disabled@example.com',
        emailVerified: true,
        id: 'disabled',
        name: 'Disabled Person',
        role: 'stores',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'device@example.com',
        emailVerified: true,
        id: 'device',
        isDevice: true,
        name: 'Stores Device',
        role: 'stores',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'no-role@example.com',
        emailVerified: true,
        id: 'no-role',
        name: 'No Equipment Role',
        role: null,
        updatedAt: now,
      },
    ]);

    await expect(
      listInventoryRecipients({ db: context.db, input: { cursor: 0, limit: 1, search: 'Connor' } }),
    ).resolves.toEqual({
      items: [{ id: 'connor', name: 'Connor Mechanic', thumbnailDataUrl: null }],
      nextCursor: null,
      total: 1,
    });
  });
});
