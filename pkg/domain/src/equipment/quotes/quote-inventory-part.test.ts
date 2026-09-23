import type { QuoteInventoryPartOption } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import {
  formatFreeStock,
  formatPlateWorking,
  proposeQuoteInventoryPartRow,
  quoteInventoryPartBasis,
  quoteInventoryPartLabel,
  quoteInventoryPartName,
  quoteInventoryPartPriceNote,
  quoteInventoryPartQuantityLabel,
  quoteInventoryPartUnitPrice,
} from './quote-inventory-part.js';

function pricedPart(
  sellPricePerBasisUnit: number,
  overrides: Partial<QuoteInventoryPartOption> = {},
): QuoteInventoryPartOption {
  return {
    averageUtilizationPercent: null,
    code: 'BOLT-M10',
    freeQuantity: 12,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'M10 bolt',
    partCategoryName: 'Fasteners',
    standardPurchaseLengthMm: null,
    unitOfMeasure: 'piece',
    ...overrides,
    priceNote: null,
    sellPricePerBasisUnit,
  };
}

const bolt = pricedPart(2.5);
const tube = pricedPart(0.125, {
  code: 'TUBE-50',
  name: '50x50 tube',
  standardPurchaseLengthMm: 6_000,
  unitOfMeasure: 'mm',
});
const plate = pricedPart(1_000, { averageUtilizationPercent: 70, code: 'PLATE-10', name: '10mm plate' });
const unmarked: QuoteInventoryPartOption = {
  ...pricedPart(0, { code: 'NUT-M10', name: 'M10 nut' }),
  priceNote: 'no-markup',
  sellPricePerBasisUnit: null,
};

describe('quoteInventoryPartBasis', () => {
  it('sells a counted or weighed Part by the unit, a linear Part by length, and a plate by share', () => {
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: null, unitOfMeasure: 'piece' })).toBe('unit');
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: null, unitOfMeasure: 'kg' })).toBe('unit');
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: null, unitOfMeasure: 'mm' })).toBe('length');
    expect(quoteInventoryPartBasis({ averageUtilizationPercent: 70, unitOfMeasure: 'piece' })).toBe('plate');
  });
});

describe('proposeQuoteInventoryPartRow', () => {
  it('prices a counted Part per unit and needs only a quantity', () => {
    expect(proposeQuoteInventoryPartRow(bolt, { lengthMm: null, platePercent: null, quantity: 3 })).toEqual({
      name: 'M10 bolt',
      quantity: 3,
      unitPrice: 2.5,
    });
  });

  it('prices one piece of a length from the per-millimetre price and names the cut', () => {
    const row = proposeQuoteInventoryPartRow(tube, { lengthMm: 450, platePercent: null, quantity: 4 });

    expect(row).toEqual({ name: '50x50 tube (450 mm)', quantity: 4, unitPrice: 56.25 });
  });

  it('prices a share of a plate with the scrap counted', () => {
    const row = proposeQuoteInventoryPartRow(plate, { lengthMm: null, platePercent: 8, quantity: 2 });

    expect(row).toEqual({ name: '10mm plate', quantity: 2, unitPrice: 114.29 });
  });

  it('adds an unpriced Part at zero', () => {
    expect(proposeQuoteInventoryPartRow(unmarked, { lengthMm: null, platePercent: null, quantity: 1 })).toEqual({
      name: 'M10 nut',
      quantity: 1,
      unitPrice: 0,
    });
  });

  it('proposes nothing while a box the basis needs is empty, and ignores boxes it does not', () => {
    expect(proposeQuoteInventoryPartRow(tube, { lengthMm: null, platePercent: 8, quantity: 1 })).toBeNull();
    expect(proposeQuoteInventoryPartRow(plate, { lengthMm: 450, platePercent: null, quantity: 1 })).toBeNull();
    expect(proposeQuoteInventoryPartRow(bolt, { lengthMm: null, platePercent: null, quantity: null })).toBeNull();
    expect(proposeQuoteInventoryPartRow(bolt, { lengthMm: 450, platePercent: 8, quantity: 1 })).toMatchObject({
      unitPrice: 2.5,
    });
  });
});

describe('quoteInventoryPartUnitPrice', () => {
  it('rounds a half cent up', () => {
    expect(
      quoteInventoryPartUnitPrice(
        { averageUtilizationPercent: null, sellPricePerBasisUnit: 10.075 },
        { basis: 'unit' },
      ),
    ).toBe(10.08);
  });

  it('refuses a plate amount for a Part without an Average Utilization %', () => {
    expect(() =>
      quoteInventoryPartUnitPrice(
        { averageUtilizationPercent: null, sellPricePerBasisUnit: 1_000 },
        { basis: 'plate', platePercent: 8 },
      ),
    ).toThrow('Average Utilization');
  });
});

describe('quoteInventoryPartName', () => {
  it('names a length by its cut and a plate by the Part alone', () => {
    expect(quoteInventoryPartName({ name: '50x50 tube' }, { basis: 'length', lengthMm: 450 })).toBe(
      '50x50 tube (450 mm)',
    );
    expect(quoteInventoryPartName({ name: '10mm plate' }, { basis: 'plate', platePercent: 8 })).toBe('10mm plate');
  });
});

describe('dialog copy', () => {
  it('says why a Part cannot be priced and what the row lands at', () => {
    expect(quoteInventoryPartPriceNote({ partCategoryName: 'Fasteners', priceNote: 'no-cost' }, 'ZAR')).toBe(
      'This Part has no cost yet, so no price can be worked out. The row will be added at R 0.00.',
    );
    expect(quoteInventoryPartPriceNote({ partCategoryName: 'Fasteners', priceNote: 'no-markup' }, 'ZAR')).toBe(
      'Fasteners has no markup set, so no price can be worked out. The row will be added at R 0.00.',
    );
  });

  it('shows the plate working with the yield applied', () => {
    expect(formatPlateWorking(8, 70)).toBe('8% of plate ÷ 70% yield = 11.43% of a plate');
  });

  it('counts a length in pieces and everything else as a quantity', () => {
    expect(quoteInventoryPartQuantityLabel('length')).toBe('Pieces');
    expect(quoteInventoryPartQuantityLabel('plate')).toBe('Quantity');
    expect(quoteInventoryPartQuantityLabel('unit')).toBe('Quantity');
  });

  it('labels a Part by code and name and reads its Free Stock in its own unit', () => {
    expect(quoteInventoryPartLabel(tube)).toBe('TUBE-50 · 50x50 tube');
    expect(formatFreeStock({ freeQuantity: 4, unitOfMeasure: 'mm' })).toBe('4 pieces free');
    expect(formatFreeStock({ freeQuantity: 12, unitOfMeasure: 'piece' })).toBe('12 pc free');
    expect(formatFreeStock({ freeQuantity: 0, unitOfMeasure: 'piece' })).toBe('None free');
  });
});
