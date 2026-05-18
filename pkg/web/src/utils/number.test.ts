import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPercent } from './number.js';

describe('formatCurrency', () => {
  it('formats finite values with grouping and without padded decimals', () => {
    expect(formatCurrency(1)).toBe('1');
    expect(formatCurrency(1000)).toBe('1,000');
    expect(formatCurrency(1000.5)).toBe('1,000.5');
    expect(formatCurrency(1000.56)).toBe('1,000.56');
  });

  it('formats finite values with a currency code prefix', () => {
    expect(formatCurrency(1000, 'ZAR')).toBe('R 1,000');
    expect(formatCurrency(1000.56, 'USD')).toBe('USD 1,000.56');
  });

  it('formats non-finite values as empty text', () => {
    expect(formatCurrency(NaN)).toBe('');
    expect(formatCurrency(Infinity)).toBe('');
  });
});

describe('formatPercent', () => {
  it('formats finite values with one decimal place', () => {
    expect(formatPercent(0)).toBe('0.0');
    expect(formatPercent(3.86)).toBe('3.9');
    expect(formatPercent(12)).toBe('12.0');
  });

  it('formats non-finite values as empty text', () => {
    expect(formatPercent(NaN)).toBe('');
    expect(formatPercent(Infinity)).toBe('');
  });
});
