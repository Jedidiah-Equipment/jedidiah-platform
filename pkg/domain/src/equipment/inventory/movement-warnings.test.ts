import { describe, expect, test } from 'vitest';
import { deriveMovementWarnings, unacknowledgedWarnings } from './movement-warnings.js';

const jobFacts = {
  bucketQuantityOnHand: 10,
  cfoQuantity: 0,
  drawnBucketQuantity: 0,
  drawnQuantity: 0,
} as const;

describe('deriveMovementWarnings — a Job draw', () => {
  test('stays quiet inside the CFO and the rack', () => {
    expect(deriveMovementWarnings({ facts: { ...jobFacts, cfoQuantity: 5, kind: 'checkout' }, quantity: 4 })).toEqual(
      [],
    );
  });

  test('warns past a CFO that planned the Part, counting what the Job already drew', () => {
    expect(
      deriveMovementWarnings({
        facts: { ...jobFacts, cfoQuantity: 5, drawnQuantity: 4, kind: 'checkout' },
        quantity: 2,
      }),
    ).toEqual(['exceeds-cfo']);
  });

  test('says nothing about a CFO on a Job that never planned the Part', () => {
    // "Past the CFO" means nothing where there is no CFO; the variance report answers unplanned draws.
    expect(deriveMovementWarnings({ facts: { ...jobFacts, kind: 'checkout' }, quantity: 99 })).toEqual([
      'negative-stock-on-hand',
    ]);
  });

  test('warns when the draw takes its own length bucket negative', () => {
    expect(
      deriveMovementWarnings({ facts: { ...jobFacts, bucketQuantityOnHand: 2, kind: 'checkout' }, quantity: 3 }),
    ).toEqual(['negative-stock-on-hand']);
  });

  test('reports both draw warnings when one movement earns them together', () => {
    expect(
      deriveMovementWarnings({
        facts: { ...jobFacts, bucketQuantityOnHand: 1, cfoQuantity: 2, kind: 'checkout' },
        quantity: 3,
      }),
    ).toEqual(['exceeds-cfo', 'negative-stock-on-hand']);
  });

  test('judges a return against its own length bucket, not the Part total', () => {
    const facts = { ...jobFacts, drawnBucketQuantity: 2, drawnQuantity: 9, kind: 'return-to-store' } as const;

    expect(deriveMovementWarnings({ facts, quantity: 2 })).toEqual([]);
    expect(deriveMovementWarnings({ facts, quantity: 3 })).toEqual(['exceeds-drawn']);
  });

  test('never calls the rack short on a return, which puts stock back', () => {
    expect(
      deriveMovementWarnings({
        facts: { ...jobFacts, bucketQuantityOnHand: 0, drawnBucketQuantity: 5, kind: 'return-to-store' },
        quantity: 5,
      }),
    ).toEqual([]);
  });
});

describe('deriveMovementWarnings — a Receipt', () => {
  test('warns only past what the line ordered, counting earlier receipts', () => {
    const facts = { kind: 'receipt', orderedQuantity: 10, receivedQuantity: 8 } as const;

    expect(deriveMovementWarnings({ facts, quantity: 2 })).toEqual([]);
    expect(deriveMovementWarnings({ facts, quantity: 3 })).toEqual(['exceeds-ordered']);
  });
});

describe('deriveMovementWarnings — a Return to Supplier', () => {
  test('warns past what the line still holds, and posts either way', () => {
    const facts = { kind: 'return-to-supplier', outstandingReceivedQuantity: 4 } as const;

    expect(deriveMovementWarnings({ facts, quantity: 4 })).toEqual([]);
    expect(deriveMovementWarnings({ facts, quantity: 5 })).toEqual(['exceeds-received']);
  });
});

describe('deriveMovementWarnings — a Build', () => {
  const bom = [
    { componentPartId: 'plate', isInformational: false, quantity: 2 },
    { componentPartId: 'bolt', isInformational: false, quantity: 4 },
  ];

  test('stays quiet when every component came off the rack at BOM quantity', () => {
    expect(
      deriveMovementWarnings({
        facts: {
          bom,
          kind: 'build',
          lines: [
            { componentPartId: 'plate', isInformational: false, quantity: 4, quantityOnHand: 10 },
            { componentPartId: 'bolt', isInformational: false, quantity: 8, quantityOnHand: 20 },
          ],
        },
        quantity: 2,
      }),
    ).toEqual([]);
  });

  test('warns on a deviation from the BOM and on a short rack, once each across components', () => {
    expect(
      deriveMovementWarnings({
        facts: {
          bom,
          kind: 'build',
          lines: [
            { componentPartId: 'plate', isInformational: false, quantity: 5, quantityOnHand: 1 },
            { componentPartId: 'bolt', isInformational: false, quantity: 8, quantityOnHand: 20 },
          ],
        },
        quantity: 2,
      }),
    ).toEqual(['bom-deviation', 'negative-stock-on-hand']);
  });

  test('warns about a BOM component the builder left off the list entirely', () => {
    // The rule the browser could not reach before: it lived inside the cost-deriving `deriveBuild`.
    expect(
      deriveMovementWarnings({
        facts: {
          bom,
          kind: 'build',
          lines: [{ componentPartId: 'plate', isInformational: false, quantity: 4, quantityOnHand: 10 }],
        },
        quantity: 2,
      }),
    ).toEqual(['bom-deviation']);
  });

  test('keeps a raw-material line out of the rack judgement but not out of the deviation', () => {
    const lines = [{ componentPartId: 'plate', isInformational: true, quantity: 5, quantityOnHand: 0 }];

    expect(
      deriveMovementWarnings({
        facts: { bom: [{ componentPartId: 'plate', isInformational: true, quantity: 2 }], kind: 'build', lines },
        quantity: 2,
      }),
    ).toEqual(['bom-deviation']);
  });
});

describe('unacknowledgedWarnings', () => {
  test('is empty when the post said nothing the operator had not already confirmed', () => {
    expect(unacknowledgedWarnings({ acknowledged: ['exceeds-cfo'], posted: ['exceeds-cfo'] })).toEqual([]);
  });

  test('names what the post added, which is what moved under the preview', () => {
    expect(
      unacknowledgedWarnings({ acknowledged: ['exceeds-cfo'], posted: ['exceeds-cfo', 'negative-stock-on-hand'] }),
    ).toEqual(['negative-stock-on-hand']);
  });

  test('says nothing about a warning the preview raised and the post did not', () => {
    // The facts moved in the operator's favour between the preview and the post; there is nothing
    // to tell them, because what they confirmed simply did not happen.
    expect(unacknowledgedWarnings({ acknowledged: ['exceeds-drawn'], posted: [] })).toEqual([]);
  });

  test('treats an unpreviewed post as entirely unacknowledged', () => {
    expect(unacknowledgedWarnings({ acknowledged: [], posted: ['exceeds-received'] })).toEqual(['exceeds-received']);
  });
});
