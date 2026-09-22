import { describe, expect, it } from 'vitest';

import {
  quoteInventoryPartBasis,
  quoteInventoryPartName,
  quoteInventoryPartUnitPrice,
} from './quote-inventory-part.js';

describe('quoteInventoryPartBasis', () => {
  it('sells a counted or weighed Part by the unit, a linear Part by length, and a plate by share', () => {
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: null, unitOfMeasure: 'piece' })).toBe('unit');
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: null, unitOfMeasure: 'kg' })).toBe('unit');
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: null, unitOfMeasure: 'mm' })).toBe('length');
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: 70, unitOfMeasure: 'piece' })).toBe('plate');
  });
});

describe('quoteInventoryPartUnitPrice', () => {
  it('prices one unit at the sell price', () => {
    expect(quoteInventoryPartUnitPrice({ amount: { basis: 'unit' }, sellPricePerBasisUnit: 12.5 })).toBe(12.5);
  });

  it('prices one piece of a length from the per-millimetre price', () => {
    expect(
      quoteInventoryPartUnitPrice({ amount: { basis: 'length', lengthMm: 450 }, sellPricePerBasisUnit: 0.125 }),
    ).toBe(56.25);
  });

  it('prices a share of a plate with the scrap counted', () => {
    expect(
      quoteInventoryPartUnitPrice({
        amount: { averageUtilizationPercent: 70, basis: 'plate', platePercent: 8 },
        sellPricePerBasisUnit: 1_000,
      }),
    ).toBe(114.29);
  });

  it('adds an unpriced row at zero', () => {
    expect(quoteInventoryPartUnitPrice({ amount: { basis: 'unit' }, sellPricePerBasisUnit: null })).toBe(0);
  });

  it('rounds a half cent up', () => {
    expect(quoteInventoryPartUnitPrice({ amount: { basis: 'unit' }, sellPricePerBasisUnit: 10.075 })).toBe(10.08);
  });
});

describe('quoteInventoryPartName', () => {
  it('names a length by its cut and a plate by the Part alone', () => {
    expect(quoteInventoryPartName({ name: '50x50 tube' }, { basis: 'length', lengthMm: 450 })).toBe(
      '50x50 tube (450 mm)',
    );
    expect(
      quoteInventoryPartName(
        { name: '10mm plate' },
        { averageUtilizationPercent: 70, basis: 'plate', platePercent: 8 },
      ),
    ).toBe('10mm plate');
  });
});
