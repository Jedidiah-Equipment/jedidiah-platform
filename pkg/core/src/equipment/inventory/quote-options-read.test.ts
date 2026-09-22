import { describe, expect } from 'vitest';

import { seedPartsSaleQuote, test } from '../test/inventory-fixtures.js';
import { listInventoryQuoteOptions } from './quote-options-read.js';

describe('listInventoryQuoteOptions', () => {
  test('offers only Parts Sales, and only live ones for a Checkout', async ({ context }) => {
    const draft = await seedPartsSaleQuote(context.db, { status: 'draft' });
    const sent = await seedPartsSaleQuote(context.db, { status: 'sent' });
    const accepted = await seedPartsSaleQuote(context.db, { status: 'accepted' });
    const rejected = await seedPartsSaleQuote(context.db, { status: 'rejected' });
    const cancelled = await seedPartsSaleQuote(context.db, { status: 'cancelled' });
    const read = (movementType: 'checkout' | 'return-to-store') =>
      listInventoryQuoteOptions({ db: context.db, input: { cursor: 0, limit: 20, movementType, search: '' } });

    const checkout = await read('checkout');
    const returns = await read('return-to-store');

    expect(checkout.items.map((item) => item.id).sort()).toEqual([draft.id, sent.id, accepted.id].sort());
    expect(returns.items.map((item) => item.id).sort()).toEqual(
      [draft.id, sent.id, accepted.id, rejected.id, cancelled.id].sort(),
    );
    expect(checkout.items.find((item) => item.id === accepted.id)).toEqual({
      code: `QUO-${accepted.code.toString().padStart(5, '0')}`,
      customerCompanyName: 'Parts Customer',
      id: accepted.id,
      status: 'accepted',
      workTitle: 'Spare bolts',
    });
  });

  test('searches by code, Customer and Work Title, and pages', async ({ context }) => {
    const bolts = await seedPartsSaleQuote(context.db, { customerName: 'Acme Farms', workTitle: 'Hitch pins' });
    const seals = await seedPartsSaleQuote(context.db, {
      customerName: 'Berg Transport',
      workTitle: 'Hydraulic seals',
    });
    const search = (value: string, limit = 20, cursor = 0) =>
      listInventoryQuoteOptions({
        db: context.db,
        input: { cursor, limit, movementType: 'checkout', search: value },
      }).then((result) => ({ ...result, ids: result.items.map((item) => item.id) }));

    expect((await search(String(bolts.code))).ids).toEqual([bolts.id]);
    expect((await search(`QUO-${seals.code.toString().padStart(5, '0')}`)).ids).toEqual([seals.id]);
    expect((await search('berg')).ids).toEqual([seals.id]);
    expect((await search('hitch')).ids).toEqual([bolts.id]);

    const firstPage = await search('', 1);
    const secondPage = await search('', 1, 1);
    expect(firstPage).toMatchObject({ nextCursor: 1, total: 2 });
    expect(secondPage).toMatchObject({ nextCursor: null, total: 2 });
    expect([...firstPage.ids, ...secondPage.ids].sort()).toEqual([bolts.id, seals.id].sort());
  });
});
