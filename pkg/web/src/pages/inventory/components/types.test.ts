import { describe, expect, it } from 'vitest';

import {
  deriveJobMovementWarnings,
  distinctPartOptions,
  parseAdjustmentForm,
  parseJobMovementForm,
  parseRevaluationForm,
  perpetualPartOptions,
  revaluablePartOptions,
  type StockPartOption,
} from './types.js';

const piece: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'P-100',
  partId: '00000000-0000-4000-8000-000000000001',
  partName: 'Bearing',
  standardPurchaseLengthMm: null,
  unitOfMeasure: 'piece',
};
const linear: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'RAW-100',
  partId: '00000000-0000-4000-8000-000000000002',
  partName: 'Channel',
  standardPurchaseLengthMm: 6_000,
  unitOfMeasure: 'mm',
};

describe('parseAdjustmentForm', () => {
  it('maps linear form strings to an opening-balance input', () => {
    const result = parseAdjustmentForm({
      canReadCost: true,
      part: linear,
      values: {
        delta: '2',
        lengthMm: '6000',
        note: '  Go-live count  ',
        partId: linear.partId,
        reason: 'opening-balance',
        unitCost: '750.50',
      },
    });

    expect(result).toMatchObject({
      data: {
        delta: 2,
        lengthMm: 6_000,
        note: 'Go-live count',
        partId: linear.partId,
        reason: 'opening-balance',
        unitCost: 750.5,
      },
      success: true,
    });
  });

  it('discards hidden cost and length fields', () => {
    const result = parseAdjustmentForm({
      canReadCost: false,
      part: piece,
      values: {
        delta: '-1',
        lengthMm: '6000',
        note: 'Damaged in storage',
        partId: piece.partId,
        reason: 'damage',
        unitCost: '99',
      },
    });

    expect(result).toMatchObject({ data: { lengthMm: null, unitCost: null }, success: true });
  });

  it('rejects missing required values and notes', () => {
    const result = parseAdjustmentForm({
      canReadCost: true,
      part: linear,
      values: {
        delta: '',
        lengthMm: '',
        note: '',
        partId: linear.partId,
        reason: 'damage',
        unitCost: '',
      },
    });

    expect(result.success).toBe(false);
  });

  it('never maps a cost for an internally fabricated Part', () => {
    const result = parseAdjustmentForm({
      canReadCost: true,
      part: { ...piece, isInternallyFabricated: true },
      values: {
        delta: '1',
        lengthMm: '',
        note: '',
        partId: piece.partId,
        reason: 'opening-balance',
        unitCost: '99',
      },
    });

    expect(result).toMatchObject({ data: { unitCost: null }, success: true });
  });
});

describe('parseRevaluationForm', () => {
  it('maps the new cost and normalizes a blank note', () => {
    expect(parseRevaluationForm({ note: '  ', partId: piece.partId, unitCost: '25.50' })).toMatchObject({
      data: { note: null, partId: piece.partId, unitCost: 25.5 },
      success: true,
    });
  });
});

describe('Job movement form behavior', () => {
  it('maps the standard purchase length into a linear movement', () => {
    expect(
      parseJobMovementForm({
        part: linear,
        values: { jobId: piece.partId, lengthMm: '6000', partId: linear.partId, quantity: '2' },
      }),
    ).toMatchObject({
      data: { jobId: piece.partId, lengthMm: 6_000, partId: linear.partId, quantity: 2 },
      success: true,
    });
  });

  it('surfaces over-CFO and negative-SOH checkout warnings without rejecting the input', () => {
    const warnings = deriveJobMovementWarnings({
      jobStock: {
        cfoQuantity: 2,
        committedQuantity: 0,
        drawnQuantity: 2,
        lengthBuckets: [],
        partCode: linear.partCode,
        partId: linear.partId,
        partName: linear.partName,
        standardPurchaseLengthMm: 6_000,
        unitOfMeasure: 'mm',
      },
      lengthMm: 6_000,
      part: linear,
      quantity: 2,
      stockOnHand: [
        {
          averageUnitCost: 0.1,
          asOfLastCount: null,
          committed: 0,
          free: 1,
          isInternallyFabricated: false,
          lengthMm: 6_000,
          partCode: linear.partCode,
          partId: linear.partId,
          partName: linear.partName,
          quantity: 1,
          standardPurchaseLengthMm: 6_000,
          stockTrackingMode: 'perpetual',
          totalValue: 600,
          unitOfMeasure: 'mm',
        },
      ],
      type: 'checkout',
    });

    expect(warnings).toEqual(['exceeds-cfo', 'negative-stock-on-hand']);
  });

  it('surfaces an over-return warning', () => {
    expect(
      deriveJobMovementWarnings({
        jobStock: undefined,
        lengthMm: null,
        part: piece,
        quantity: 1,
        stockOnHand: [],
        type: 'return-to-store',
      }),
    ).toEqual(['exceeds-drawn']);
  });
});

describe('distinctPartOptions', () => {
  it('collapses length buckets into one selectable Part', () => {
    const row = {
      averageUnitCost: 0.1,
      asOfLastCount: null,
      committed: 0,
      free: 2,
      isInternallyFabricated: false,
      lengthMm: 3_000,
      partCode: linear.partCode,
      partId: linear.partId,
      partName: linear.partName,
      quantity: 2,
      standardPurchaseLengthMm: 6_000,
      stockTrackingMode: 'perpetual' as const,
      totalValue: 600,
      unitOfMeasure: linear.unitOfMeasure,
    };

    expect(distinctPartOptions([row, { ...row, lengthMm: 6_000 }])).toEqual([linear]);
  });

  it('removes internally fabricated Parts from revaluation choices', () => {
    expect(revaluablePartOptions([piece, { ...linear, isInternallyFabricated: true }])).toEqual([piece]);
  });

  it('keeps periodic Parts in general choices but excludes them from Job movements', () => {
    const periodic = {
      averageUnitCost: 0.1,
      asOfLastCount: null,
      committed: 0,
      free: 2,
      isInternallyFabricated: false,
      lengthMm: 6_000,
      partCode: linear.partCode,
      partId: linear.partId,
      partName: linear.partName,
      quantity: 2,
      standardPurchaseLengthMm: 6_000,
      stockTrackingMode: 'periodic' as const,
      totalValue: 600,
      unitOfMeasure: linear.unitOfMeasure,
    };

    expect(distinctPartOptions([periodic])).toEqual([linear]);
    expect(perpetualPartOptions([periodic])).toEqual([]);
  });
});
