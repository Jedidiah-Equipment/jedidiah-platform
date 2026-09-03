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
   * The tablet's own account holds the `stores` role, so without this it would appear in its own
   * grid — and `resolveMovementActor` refuses a device as the actor, so the tile could only ever
   * fail on the post.
   */
  test('leaves shared devices out entirely, whoever is asking', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values([
      {
        createdAt: now,
        email: 'tablet@example.com',
        emailVerified: true,
        id: 'stores-tablet',
        isDevice: true,
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

    await expect(listQuickSwitchActors({ db: context.db })).resolves.toEqual({
      items: [{ id: 'stores-person', name: 'Stores Person', thumbnailDataUrl: null }],
    });
  });
});
