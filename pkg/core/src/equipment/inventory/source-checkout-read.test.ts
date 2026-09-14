import { user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, test } from '../test/inventory-fixtures.js';
import { listSourceCheckouts } from './source-checkout-read.js';
import { postAdjustment, postCheckout, postReturnToStore } from './stock-movement-service.js';

describe('listSourceCheckouts', () => {
  test('filters no-Job Checkouts and keeps fully returned sources discoverable newest first', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'connor-picker@example.com',
      emailVerified: true,
      id: 'connor-picker',
      name: 'Connor Picker',
      role: 'bay-operator',
      updatedAt: now,
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    const checkout = await postCheckout({
      actorUserId,
      db: context.db,
      input: {
        lengthMm: null,
        note: 'repair drill',
        partId: context.parts.piece.id,
        quantity: 2,
        recipientUserId: 'connor-picker',
      },
    });
    await postReturnToStore({
      actorUserId,
      db: context.db,
      input: { quantity: 2, sourceCheckoutId: checkout.movement.id },
    });

    await expect(
      listSourceCheckouts({
        db: context.db,
        input: { cursor: 0, limit: 10, partId: context.parts.piece.id, search: 'Connor' },
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: checkout.movement.id,
          note: 'repair drill',
          quantity: 2,
          recipientName: 'Connor Picker',
          returnedQuantity: 2,
          unitCost: 10,
        },
      ],
      nextCursor: null,
      total: 1,
    });
  });
});
