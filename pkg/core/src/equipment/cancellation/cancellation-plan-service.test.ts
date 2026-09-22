import { describe, expect } from 'vitest';

import { postAdjustment, postCheckout, postReturnToStore } from '../inventory/stock-movement-service.js';
import { actorUserId, adjustmentInput, seedPartsSaleQuote, test } from '../test/inventory-fixtures.js';
import { getQuoteCancellationPlan } from './cancellation-plan-service.js';

describe('getQuoteCancellationPlan for a Parts Sale', () => {
  test('lists the stock still out, and nothing once it is back', async ({ context }) => {
    const partsSale = await seedPartsSaleQuote(context.db);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 5, unitCost: 10 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    const piece = { lengthMm: null, partId: context.parts.piece.id, quoteId: partsSale.id };
    const linear = { lengthMm: 6_000, partId: context.parts.linear.id, quoteId: partsSale.id };
    await postCheckout({ actorUserId, db: context.db, input: { ...piece, quantity: 3 } });
    await postCheckout({ actorUserId, db: context.db, input: { ...linear, quantity: 1 } });
    await postReturnToStore({ actorUserId, db: context.db, input: { ...linear, quantity: 1 } });

    await expect(getQuoteCancellationPlan({ db: context.db, id: partsSale.id })).resolves.toEqual({
      drawnStock: [
        { lengthMm: null, outstandingQuantity: 3, partCode: 'PIECE', partName: 'PIECE', unitOfMeasure: 'piece' },
      ],
      job: null,
      unit: null,
    });

    await postReturnToStore({ actorUserId, db: context.db, input: { ...piece, quantity: 3 } });

    await expect(getQuoteCancellationPlan({ db: context.db, id: partsSale.id })).resolves.toMatchObject({
      drawnStock: [],
    });
  });
});
