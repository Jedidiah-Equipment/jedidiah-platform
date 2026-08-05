import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, test } from '../test/inventory-fixtures.js';
import { ScannedPartNotFoundError } from './stock-movement-errors.js';
import { getPartStockByCode, postAdjustment } from './stock-movement-service.js';

describe('getPartStockByCode', () => {
  test('resolves a scanned label to the Part’s stock position', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 7, unitCost: 12 }),
    });

    await expect(getPartStockByCode({ code: 'PIECE', db: context.db })).resolves.toMatchObject({
      partCode: 'PIECE',
      partId: context.parts.piece.id,
      quantity: 7,
      unitOfMeasure: 'piece',
    });
  });

  /** The part-result screen asks the length question off these buckets, so they must survive the read. */
  test('carries the length buckets a linear Part is held in', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 3, lengthMm: 6_000 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 3_000 }),
    });

    const row = await getPartStockByCode({ code: 'LINEAR', db: context.db });

    expect(row.standardPurchaseLengthMm).toBe(6_000);
    expect(row.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lengthMm: 3_000, quantity: 2 }),
        expect.objectContaining({ lengthMm: 6_000, quantity: 3 }),
      ]),
    );
  });

  test('matches the code exactly, so a partial scan never resolves to the wrong Part', async ({ context }) => {
    await expect(getPartStockByCode({ code: 'PIEC', db: context.db })).rejects.toBeInstanceOf(ScannedPartNotFoundError);
    await expect(getPartStockByCode({ code: 'piece', db: context.db })).rejects.toBeInstanceOf(
      ScannedPartNotFoundError,
    );
  });

  test('reports an unknown label rather than returning an empty row', async ({ context }) => {
    await expect(getPartStockByCode({ code: 'NOT-A-PART', db: context.db })).rejects.toBeInstanceOf(
      ScannedPartNotFoundError,
    );
  });
});
