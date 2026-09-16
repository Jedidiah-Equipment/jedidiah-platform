import { describe, expect, it } from 'vitest';
import { RateCreateValues, toRateInput } from './types.js';

describe('Rate form mapping', () => {
  it('clears Measure Type for a time Rate', () => {
    expect(toRateInput({ name: 'Hourly', basis: 'time', measureTypeId: 'stale', amount: 500 })).toEqual({
      name: 'Hourly',
      basis: 'time',
      measureTypeId: null,
      amount: 500,
    });
  });

  it('keeps the selected Measure Type for a measure Rate', () => {
    const measureTypeId = '00000000-0000-4000-8000-000000000001';
    expect(toRateInput({ name: 'Per hectare', basis: 'measure', measureTypeId, amount: 250 })).toEqual({
      name: 'Per hectare',
      basis: 'measure',
      measureTypeId,
      amount: 250,
    });
  });

  it('puts a missing Measure Type error on that field', () => {
    const result = RateCreateValues.safeParse({
      name: 'Per hectare',
      basis: 'measure',
      measureTypeId: '',
      amount: 250,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['measureTypeId'] }));
  });
});
