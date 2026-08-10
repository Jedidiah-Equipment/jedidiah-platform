import { describe, expect, it } from 'vitest';

import {
  formatLengthBucket,
  formatLengthMetres,
  formatPartQuantity,
  getPartQuantityUnitDisplay,
} from './part-quantity-format.js';

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

  it('renders millimetre parts with an mm suffix, the dimension its lengths are measured in', () => {
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

  it('counts linear stock in pieces, never in millimetres', () => {
    expect(formatPartQuantity(2, 'mm')).toBe('2 pieces');
  });

  it('preserves fractional linear stock quantities', () => {
    expect(formatPartQuantity(0.5, 'mm')).toBe('0.5 pieces');
    expect(formatPartQuantity(1e-3, 'mm')).toBe('0.001 pieces');
  });

  it('normalizes floating-point residue at the supported quantity precision', () => {
    expect(formatPartQuantity(-1e-10, 'mm')).toBe('0 pieces');
  });
});

describe('length formatting', () => {
  it('shows a length in metres, keeping one decimal only when it needs one', () => {
    expect(formatLengthMetres(6_000)).toBe('6 m');
    expect(formatLengthMetres(4_200)).toBe('4.2 m');
  });

  it('reads a bucket as its length and its piece count', () => {
    expect(formatLengthBucket(13_000, 9)).toBe('13 m × 9');
    expect(formatLengthBucket(13_000, 0.5)).toBe('13 m × 0.5');
  });
});
