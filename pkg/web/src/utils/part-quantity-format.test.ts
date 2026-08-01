import { describe, expect, it } from 'vitest';

import { formatPartQuantity, getPartQuantityUnitDisplay } from './part-quantity-format.js';

describe('getPartQuantityUnitDisplay', () => {
  it('renders piece parts with a compact suffix', () => {
    expect(getPartQuantityUnitDisplay('piece')).toEqual({
      label: 'Pieces',
      suffix: 'pc',
    });
  });

  it('renders measured units with their unit suffixes', () => {
    expect(getPartQuantityUnitDisplay('kg')).toEqual({ label: 'Kilograms', suffix: 'kg' });
    expect(getPartQuantityUnitDisplay('litre')).toEqual({ label: 'Litres', suffix: 'L' });
  });

  it('renders millimetre parts with an mm suffix', () => {
    expect(getPartQuantityUnitDisplay('mm')).toEqual({
      label: 'Millimetres',
      suffix: 'mm',
    });
  });
});

describe('formatPartQuantity', () => {
  it('formats piece counts with their unit suffix', () => {
    expect(formatPartQuantity(3, 'piece')).toBe('3 pc');
  });

  it('formats millimetre quantities with the unit suffix', () => {
    expect(formatPartQuantity(6000, 'mm')).toBe('6000 mm');
  });
});
