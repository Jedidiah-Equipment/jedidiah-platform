import { describe, expect, it } from 'vitest';

import {
  distinctPartOptions,
  parseAdjustmentForm,
  parseRevaluationForm,
  revaluablePartOptions,
  type StockPartOption,
} from './types.js';

const piece: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'P-100',
  partId: '00000000-0000-4000-8000-000000000001',
  partName: 'Bearing',
  unitOfMeasure: 'piece',
};
const linear: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'RAW-100',
  partId: '00000000-0000-4000-8000-000000000002',
  partName: 'Channel',
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

describe('distinctPartOptions', () => {
  it('collapses length buckets into one selectable Part', () => {
    const row = {
      averageUnitCost: 0.1,
      asOfLastCount: null,
      isInternallyFabricated: false,
      lengthMm: 3_000,
      partCode: linear.partCode,
      partId: linear.partId,
      partName: linear.partName,
      quantity: 2,
      stockTrackingMode: 'perpetual' as const,
      totalValue: 600,
      unitOfMeasure: linear.unitOfMeasure,
    };

    expect(distinctPartOptions([row, { ...row, lengthMm: 6_000 }])).toEqual([linear]);
  });

  it('removes internally fabricated Parts from revaluation choices', () => {
    expect(revaluablePartOptions([piece, { ...linear, isInternallyFabricated: true }])).toEqual([piece]);
  });
});
