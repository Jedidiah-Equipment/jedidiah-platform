import { user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { test } from '../test/inventory-fixtures.js';
import { listQuickSwitchActors } from './quick-switch-read.js';

describe('listQuickSwitchActors', () => {
  test('lists the stores people the tablet may attribute to, and nobody else', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values([
      {
        createdAt: now,
        email: 'zola@example.com',
        emailVerified: true,
        id: 'stores-zola',
        name: 'Zola Stores',
        role: 'stores',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'abel@example.com',
        emailVerified: true,
        id: 'stores-abel',
        name: 'Abel Stores',
        role: 'stores',
        updatedAt: now,
      },
      {
        banned: true,
        createdAt: now,
        email: 'banned@example.com',
        emailVerified: true,
        id: 'stores-banned',
        name: 'Banned Stores',
        role: 'stores',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'sales@example.com',
        emailVerified: true,
        id: 'sales-person',
        name: 'Sales Person',
        role: 'sales',
        updatedAt: now,
      },
    ]);

    const result = await listQuickSwitchActors({ db: context.db });

    // Sorted by name: the grid is read by eye, and the fixture's admin actor is not a stores person.
    expect(result.items).toEqual([
      { id: 'stores-abel', name: 'Abel Stores', thumbnailDataUrl: null },
      { id: 'stores-zola', name: 'Zola Stores', thumbnailDataUrl: null },
    ]);
  });

  /**
   * The tablet's own account holds the `stores` role, so it appears like any other name. It is
   * pinned to the head of the grid: choosing to post as the device is legitimate — the server
   * attributes an unnamed post that way regardless — and first is where a deliberate choice goes.
   */
  test('sorts the signed-in device account to the head of its own list', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values([
      {
        createdAt: now,
        email: 'tablet@example.com',
        emailVerified: true,
        id: 'stores-tablet',
        name: 'Stores Tablet',
        role: 'stores',
        updatedAt: now,
      },
      {
        createdAt: now,
        email: 'person@example.com',
        emailVerified: true,
        id: 'stores-person',
        name: 'Stores Person',
        role: 'stores',
        updatedAt: now,
      },
    ]);

    await expect(listQuickSwitchActors({ db: context.db, deviceUserId: 'stores-tablet' })).resolves.toEqual({
      items: [
        { id: 'stores-tablet', name: 'Stores Tablet', thumbnailDataUrl: null },
        { id: 'stores-person', name: 'Stores Person', thumbnailDataUrl: null },
      ],
    });

    // With no device named, the grid is plain alphabetical — "Person" sorts before "Tablet".
    await expect(listQuickSwitchActors({ db: context.db })).resolves.toMatchObject({
      items: [{ id: 'stores-person' }, { id: 'stores-tablet' }],
    });
  });
});
