import { partCategories, parts } from '@pkg/db/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { postAdjustment, postRevaluation } from '../inventory/stock-movement-service.js';
import { actorUserId, adjustmentInput, test } from '../test/inventory-fixtures.js';
import { partValues, seedPartCategory } from '../test/part-fixtures.js';
import { listQuoteInventoryParts } from './quote-inventory-part-read.js';

const page = { cursor: 0, limit: 20 };

describe('listQuoteInventoryParts', () => {
  test('matches a Part by its code, its name, or its Part Category name', async ({ context }) => {
    const fastenersId = await seedPartCategory(context.db, 'Fasteners');
    await context.db.insert(parts).values({
      ...partValues({
        categoryId: fastenersId,
        code: 'ATR-9001',
        supplierId: context.supplierId,
        unitOfMeasure: 'piece',
      }),
      name: 'M10 bolt',
    });
    const search = (text: string) =>
      listQuoteInventoryParts({ db: context.db, input: { ...page, search: text } }).then((result) =>
        result.items.map((item) => item.code),
      );

    await expect(search('ATR-9001')).resolves.toEqual(['ATR-9001']);
    await expect(search('m10')).resolves.toEqual(['ATR-9001']);
    await expect(search('fasteners')).resolves.toEqual(['ATR-9001']);
  });

  test('lists in-stock Parts first, then the rest by code, and counts them all', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.measured.id, { delta: 3 }),
    });

    await expect(listQuoteInventoryParts({ db: context.db, input: { ...page, search: '' } })).resolves.toMatchObject({
      items: [
        { code: 'MEASURED' },
        { code: 'FABRICATED' },
        { code: 'LINEAR' },
        { code: 'PERIODIC' },
        { code: 'PIECE' },
      ],
      nextCursor: null,
      total: 5,
    });
  });

  test('shows Free Stock, net of what open Jobs have committed', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 8, unitCost: 10 }),
    });

    // The seeded CFO Job commits five PIECE.
    await expect(
      listQuoteInventoryParts({ db: context.db, input: { ...page, search: 'PIECE' } }),
    ).resolves.toMatchObject({
      items: [{ code: 'PIECE', freeQuantity: 3 }],
    });
  });

  test('says why a Part has no price: no cost yet, or no markup on its Part Category', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.measured.id, { delta: 1, unitCost: 10 }),
    });
    const result = await listQuoteInventoryParts({ db: context.db, input: { ...page, search: '' } });

    expect(result.items.find((item) => item.code === 'PIECE')).toMatchObject({
      priceNote: 'no-cost',
      sellPricePerBasisUnit: null,
    });
    expect(result.items.find((item) => item.code === 'MEASURED')).toMatchObject({
      priceNote: 'no-markup',
      sellPricePerBasisUnit: null,
    });
  });

  test('prices a linear Part per millimetre, marked up by its Part Category', async ({ context }) => {
    await context.db.update(partCategories).set({ markupPercent: 25 }).where(eq(partCategories.id, context.categoryId));
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });

    await expect(
      listQuoteInventoryParts({ db: context.db, input: { ...page, search: 'LINEAR' } }),
    ).resolves.toMatchObject({
      items: [{ code: 'LINEAR', priceNote: null, sellPricePerBasisUnit: 0.125, standardPurchaseLengthMm: 6_000 }],
    });
  });

  test('reprices after a revaluation without moving the quantity', async ({ context }) => {
    await context.db.update(partCategories).set({ markupPercent: 25 }).where(eq(partCategories.id, context.categoryId));
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: null, partId: context.parts.piece.id, unitCost: 20 },
    });

    await expect(
      listQuoteInventoryParts({ db: context.db, input: { ...page, search: 'PIECE' } }),
    ).resolves.toMatchObject({
      items: [{ code: 'PIECE', freeQuantity: 5, sellPricePerBasisUnit: 25 }],
    });
  });

  test('carries a plate’s Average Utilization % for the dialog to price scrap with', async ({ context }) => {
    await context.db.insert(parts).values(
      partValues({
        averageUtilizationPercent: 70,
        categoryId: context.categoryId,
        code: 'PLATE',
        stockTrackingMode: 'periodic',
        supplierId: context.supplierId,
        unitOfMeasure: 'piece',
      }),
    );

    await expect(
      listQuoteInventoryParts({ db: context.db, input: { ...page, search: 'PLATE' } }),
    ).resolves.toMatchObject({
      items: [{ averageUtilizationPercent: 70, code: 'PLATE', unitOfMeasure: 'piece' }],
    });
  });
});
