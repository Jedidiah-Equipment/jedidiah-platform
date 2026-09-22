import { DateIso } from '@pkg/schema';
import type {
  InventoryQuoteOption,
  QuoteStockResult,
  SourceCheckoutOption,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import {
  hasStoresMovementTarget,
  initialStoresMovementTarget,
  previewStoresMovementWarnings,
  syncDefaultRecipient,
  toStoresMovementInput,
} from './job-movement-model';

const PART_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const QUOTE_ID = '00000000-0000-4000-8000-000000000004';
const quote = {
  code: 'QUO-00004',
  customerCompanyName: 'Acme Farms',
  id: QUOTE_ID,
  status: 'accepted',
  workTitle: 'Hitch pins',
} as InventoryQuoteOption;
const actor = { id: 'operator', name: 'Operator', thumbnailDataUrl: null };
const job = { code: 'JOB-1', id: JOB_ID } as never;
const sourceCheckout: SourceCheckoutOption = {
  createdAt: DateIso.parse('2026-08-01T08:00:00.000Z'),
  id: SOURCE_ID,
  lengthMm: null,
  note: 'Repair drill',
  partCode: 'P-100',
  partId: PART_ID,
  partName: 'Bearing',
  quantity: 3,
  recipientName: 'Connor',
  recipientUserId: 'connor',
  returnedQuantity: 1,
  unitCost: null,
  unitOfMeasure: 'piece',
};
const row: StockOnHandRow = {
  asOfLastCount: null,
  averageUnitCost: 10,
  buckets: [{ lengthMm: null, quantity: 1, totalValue: 10 }],
  committed: 0,
  estimatedOnHand: null,
  free: 1,
  isInternallyFabricated: false,
  onOrder: 0,
  partCode: 'P-100',
  partId: PART_ID,
  partName: 'Bearing',
  quantity: 1,
  standardPurchaseLengthMm: null,
  stockTrackingMode: 'perpetual',
  totalValue: 10,
  unitOfMeasure: 'piece',
};

describe('stores movement targets', () => {
  it('starts each mode empty, with the operator as the default recipient of a Checkout', () => {
    expect(initialStoresMovementTarget({ actor, mode: 'job', movementType: 'checkout' })).toEqual({
      job: null,
      kind: 'job',
    });
    expect(initialStoresMovementTarget({ actor, mode: 'person', movementType: 'checkout' })).toEqual({
      kind: 'recipient',
      purpose: '',
      recipient: actor,
    });
    expect(initialStoresMovementTarget({ actor, mode: 'person', movementType: 'return-to-store' })).toEqual({
      kind: 'source',
      sourceCheckout: null,
    });
    for (const movementType of ['checkout', 'return-to-store'] as const) {
      expect(initialStoresMovementTarget({ actor, mode: 'quote', movementType })).toEqual({
        kind: 'quote',
        quote: null,
      });
    }
  });

  it('follows a changed operator only while the recipient is still the operator default', () => {
    const nextActor = { ...actor, id: 'next-operator', name: 'Next Operator' };
    const chosen = { ...actor, id: 'chosen-recipient', name: 'Chosen Recipient' };
    const defaulted = { kind: 'recipient', purpose: '', recipient: actor } as const;

    expect(syncDefaultRecipient({ actor: null, previousActorUserId: actor.id, target: defaulted })).toEqual({
      ...defaulted,
      recipient: null,
    });
    expect(
      syncDefaultRecipient({ actor: nextActor, previousActorUserId: null, target: { ...defaulted, recipient: null } }),
    ).toEqual({ ...defaulted, recipient: nextActor });
    expect(
      syncDefaultRecipient({
        actor: nextActor,
        previousActorUserId: actor.id,
        target: { ...defaulted, recipient: chosen },
      }),
    ).toEqual({ ...defaulted, recipient: chosen });
    expect(
      syncDefaultRecipient({ actor: nextActor, previousActorUserId: actor.id, target: { job, kind: 'job' } }),
    ).toEqual({ job, kind: 'job' });
  });

  it('is ready to post once the showing target is chosen', () => {
    expect(hasStoresMovementTarget({ job: null, kind: 'job' }, undefined)).toBe(false);
    expect(hasStoresMovementTarget({ job: null, kind: 'job' }, JOB_ID)).toBe(true);
    expect(hasStoresMovementTarget({ kind: 'recipient', purpose: ' ', recipient: actor }, undefined)).toBe(false);
    expect(hasStoresMovementTarget({ kind: 'recipient', purpose: 'Repair', recipient: actor }, undefined)).toBe(true);
    expect(hasStoresMovementTarget({ kind: 'source', sourceCheckout }, undefined)).toBe(true);
    expect(hasStoresMovementTarget({ kind: 'quote', quote: null }, undefined)).toBe(false);
    expect(hasStoresMovementTarget({ kind: 'quote', quote }, undefined)).toBe(true);
  });

  it('posts each target as its own strict payload', () => {
    const facts = { actorUserId: actor.id, fixedJobId: undefined, lengthMm: null, partId: PART_ID, quantity: 2 };

    expect(toStoresMovementInput({ ...facts, movementType: 'checkout', target: { job, kind: 'job' } })).toEqual({
      actorUserId: actor.id,
      jobId: JOB_ID,
      lengthMm: null,
      partId: PART_ID,
      quantity: 2,
    });
    expect(
      toStoresMovementInput({
        ...facts,
        movementType: 'checkout',
        target: { kind: 'recipient', purpose: 'Repair drill', recipient: { ...actor, id: 'recipient' } },
      }),
    ).toEqual({
      actorUserId: actor.id,
      lengthMm: null,
      note: 'Repair drill',
      partId: PART_ID,
      quantity: 2,
      recipientUserId: 'recipient',
    });
    expect(
      toStoresMovementInput({ ...facts, movementType: 'return-to-store', target: { kind: 'source', sourceCheckout } }),
    ).toEqual({ actorUserId: actor.id, quantity: 2, sourceCheckoutId: SOURCE_ID });
    const partsSale = { actorUserId: actor.id, lengthMm: null, partId: PART_ID, quantity: 2, quoteId: QUOTE_ID };
    const target = { kind: 'quote', quote } as const;
    expect(toStoresMovementInput({ ...facts, movementType: 'checkout', target })).toEqual(partsSale);
    expect(toStoresMovementInput({ ...facts, movementType: 'return-to-store', target })).toEqual(partsSale);
  });

  it('judges a Checkout Without a Job against the rack and a linked return against its source', () => {
    const base = { jobStock: undefined, lengthMm: null, quantity: 2, quoteStock: undefined, row };

    expect(
      previewStoresMovementWarnings({
        ...base,
        movementType: 'checkout',
        target: { kind: 'recipient', purpose: 'Repair', recipient: actor },
      }),
    ).toEqual(['negative-stock-on-hand']);
    expect(
      previewStoresMovementWarnings({
        ...base,
        movementType: 'return-to-store',
        target: { kind: 'source', sourceCheckout },
      }),
    ).toEqual([]);
    expect(
      previewStoresMovementWarnings({
        ...base,
        movementType: 'return-to-store',
        quantity: 3,
        target: { kind: 'source', sourceCheckout },
      }),
    ).toEqual(['exceeds-drawn']);
  });

  it('judges a Parts Sale draw against the rack alone and its return against what the sale still holds', () => {
    const quoteStock = {
      items: [
        {
          drawnQuantity: 2,
          drawnValue: null,
          lengthBuckets: [],
          partCode: 'P-100',
          partId: PART_ID,
          partName: 'Bearing',
          unitOfMeasure: 'piece',
        },
      ],
      quote,
    } as QuoteStockResult;
    const base = { jobStock: undefined, lengthMm: null, quoteStock, row, target: { kind: 'quote', quote } } as const;

    expect(previewStoresMovementWarnings({ ...base, movementType: 'checkout', quantity: 1 })).toEqual([]);
    expect(previewStoresMovementWarnings({ ...base, movementType: 'checkout', quantity: 2 })).toEqual([
      'negative-stock-on-hand',
    ]);
    expect(previewStoresMovementWarnings({ ...base, movementType: 'return-to-store', quantity: 2 })).toEqual([]);
    expect(previewStoresMovementWarnings({ ...base, movementType: 'return-to-store', quantity: 3 })).toEqual([
      'exceeds-drawn',
    ]);
  });
});
