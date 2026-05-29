import { describe, expect, it } from 'vitest';

import { formatPartQuantity, getPartQuantityUnitDisplay } from './part-quantity-format.js';

describe('getPartQuantityUnitDisplay', () => {
  it('renders quantity parts as a plain count', () => {
    expect(getPartQuantityUnitDisplay('quantity')).toEqual({
      label: 'Quantity',
      suffix: null,
    });
  });

  it('renders millimetre parts with an mm suffix', () => {
    expect(getPartQuantityUnitDisplay('mm')).toEqual({
      label: 'Millimetres',
      suffix: 'mm',
    });
  });
});

describe('formatPartQuantity', () => {
  it('formats counts without a unit suffix', () => {
    expect(formatPartQuantity(3, 'quantity')).toBe('3');
  });

  it('formats millimetre quantities with the unit suffix', () => {
    expect(formatPartQuantity(6000, 'mm')).toBe('6000 mm');
  });
});
