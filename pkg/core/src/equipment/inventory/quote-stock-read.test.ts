import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, seedPartsSaleQuote, test } from '../test/inventory-fixtures.js';
import { listQuoteStock } from './quote-stock-read.js';
import { postAdjustment, postCheckout, postReturnToStore } from './stock-movement-service.js';

describe('listQuoteStock', () => {
  test("groups a Parts Sale's net draws by Part and length, valued at what left stores", async ({ context }) => {
    const partsSale = await seedPartsSaleQuote(context.db);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 4, lengthMm: 6_000, unitCost: 600 }),
    });
    const move = (partId: string, quantity: number, lengthMm: number | null = null) => ({
      actorUserId,
      db: context.db,
      input: { lengthMm, partId, quantity, quoteId: partsSale.id },
    });
    await postCheckout(move(context.parts.piece.id, 3));
    await postReturnToStore(move(context.parts.piece.id, 1));
    await postCheckout(move(context.parts.linear.id, 2, 6_000));
    await postCheckout(move(context.parts.linear.id, 1, 3_000));

    await expect(listQuoteStock({ db: context.db, quoteId: partsSale.id })).resolves.toEqual({
      items: [
        {
          drawnQuantity: 3,
          drawnValue: 1_500,
          lengthBuckets: [
            { drawnQuantity: 1, lengthMm: 3_000 },
            { drawnQuantity: 2, lengthMm: 6_000 },
          ],
          partCode: 'LINEAR',
          partId: context.parts.linear.id,
          partName: 'LINEAR',
          unitOfMeasure: 'mm',
        },
        {
          drawnQuantity: 2,
          drawnValue: 20,
          lengthBuckets: [],
          partCode: 'PIECE',
          partId: context.parts.piece.id,
          partName: 'PIECE',
          unitOfMeasure: 'piece',
        },
      ],
      quote: expect.objectContaining({ id: partsSale.id, status: 'accepted' }),
    });
  });

  test('refuses a Quote that is not a Parts Sale', async ({ context }) => {
    if (!context.jobs.custom.quoteId) throw new Error('Custom Job fixture has no Quote');

    await expect(listQuoteStock({ db: context.db, quoteId: context.jobs.custom.quoteId })).rejects.toMatchObject({
      code: 'inventory.quote_not_parts_sale',
    });
  });
});
