import { parts } from '@pkg/db/equipment';
import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, test } from '../test/inventory-fixtures.js';
import { partValues } from '../test/part-fixtures.js';
import { searchPartStock } from './part-search-read.js';
import { postAdjustment } from './stock-movement-service.js';

const page = { cursor: 0, limit: 10 };

describe('searchPartStock', () => {
  test('finds a Part by its code', async ({ context }) => {
    await expect(searchPartStock({ db: context.db, input: { ...page, search: 'PIECE' } })).resolves.toMatchObject({
      items: [{ partCode: 'PIECE', quantity: 0, unitOfMeasure: 'piece' }],
      nextCursor: null,
      total: 1,
    });
  });

  /** The code is what is printed on the bin; the name is what the person was told to fetch. */
  test('finds a Part by its name, not only its code', async ({ context }) => {
    await context.db.insert(parts).values({
      ...partValues({ code: 'ATR-9001', supplierId: context.supplierId, unitOfMeasure: 'piece' }),
      name: 'Chevron Metal 190X1700',
    });

    await expect(searchPartStock({ db: context.db, input: { ...page, search: 'Chevron' } })).resolves.toMatchObject({
      items: [{ partCode: 'ATR-9001', partName: 'Chevron Metal 190X1700' }],
      total: 1,
    });
  });

  test('matches case-insensitively, since nobody types a code in the case it was entered', async ({ context }) => {
    const upper = await searchPartStock({ db: context.db, input: { ...page, search: 'LINEAR' } });
    const lower = await searchPartStock({ db: context.db, input: { ...page, search: 'linear' } });

    expect(lower.items).toEqual(upper.items);
    expect(lower.items[0]?.partCode).toBe('LINEAR');
  });

  test('sums the ledger into the quantity, ignoring revaluations', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 7, unitCost: 12 }),
    });

    await expect(searchPartStock({ db: context.db, input: { ...page, search: 'PIECE' } })).resolves.toMatchObject({
      items: [{ partCode: 'PIECE', quantity: 7 }],
    });
  });

  /** A Part with an empty shelf is still the Part somebody is looking for. */
  test('returns a Part that has never moved, at zero', async ({ context }) => {
    await expect(searchPartStock({ db: context.db, input: { ...page, search: 'MEASURED' } })).resolves.toMatchObject({
      items: [{ partCode: 'MEASURED', quantity: 0 }],
    });
  });

  test('reports nothing rather than everything when the search matches no Part', async ({ context }) => {
    await expect(searchPartStock({ db: context.db, input: { ...page, search: 'NOT-A-PART' } })).resolves.toEqual({
      items: [],
      nextCursor: null,
      total: 0,
    });
  });

  test('pages through the matches, carrying the cursor to the end and then stopping', async ({ context }) => {
    const all = await searchPartStock({ db: context.db, input: { cursor: 0, limit: 100, search: '' } });
    expect(all.total).toBeGreaterThan(2);

    const first = await searchPartStock({ db: context.db, input: { cursor: 0, limit: 2, search: '' } });
    expect(first.items).toEqual(all.items.slice(0, 2));
    expect(first.nextCursor).toBe(2);

    const second = await searchPartStock({ db: context.db, input: { cursor: 2, limit: 2, search: '' } });
    expect(second.items).toEqual(all.items.slice(2, 4));

    const last = await searchPartStock({ db: context.db, input: { cursor: all.total - 1, limit: 2, search: '' } });
    expect(last.nextCursor).toBeNull();
  });

  /** The repo's unpaged sentinel: a picker that wants everything asks for `limit: 0`. */
  test('treats a zero limit as unpaged rather than as an empty page', async ({ context }) => {
    const unpaged = await searchPartStock({ db: context.db, input: { cursor: 0, limit: 0, search: '' } });

    expect(unpaged.items).toHaveLength(unpaged.total);
    expect(unpaged.nextCursor).toBeNull();
  });
});
