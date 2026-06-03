import { describe, expect, it } from 'vitest';

import { formatCurrency, formatNumber, formatPercent } from './number.js';

describe('formatNumber', () => {
  it('formats finite values with space grouping and no decimal places by default', () => {
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(1000)).toBe('1 000');
    expect(formatNumber(1000000)).toBe('1 000 000');
    expect(formatNumber(1000.56)).toBe('1 001');
  });

  it('formats finite values with caller-provided decimal places', () => {
    expect(formatNumber(1000, { decimals: 2 })).toBe('1 000.00');
    expect(formatNumber(1000.5, { decimals: 2 })).toBe('1 000.50');
    expect(formatNumber(1000.56, { decimals: 1 })).toBe('1 000.6');
  });

  it('formats non-finite values as empty text', () => {
    expect(formatNumber(NaN)).toBe('');
    expect(formatNumber(Infinity)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats finite values with space grouping and two decimal places', () => {
    expect(formatCurrency(1)).toBe('1.00');
    expect(formatCurrency(1000)).toBe('1 000.00');
    expect(formatCurrency(1000.5)).toBe('1 000.50');
    expect(formatCurrency(1000.56)).toBe('1 000.56');
  });

  it('formats finite values with a currency code prefix', () => {
    expect(formatCurrency(1000, 'ZAR')).toBe('R 1 000.00');
    expect(formatCurrency(1000.56, 'USD')).toBe('USD 1 000.56');
  });

  it('formats non-finite values as empty text', () => {
    expect(formatCurrency(NaN)).toBe('');
    expect(formatCurrency(Infinity)).toBe('');
  });
});

describe('formatPercent', () => {
  it('formats finite values with a percent symbol by default', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(3.86)).toBe('3.9%');
    expect(formatPercent(12)).toBe('12%');
  });

  it('formats finite values with caller-provided decimal places', () => {
    expect(formatPercent(0, { decimals: 1 })).toBe('0.0%');
    expect(formatPercent(3.86, { decimals: 1 })).toBe('3.9%');
    expect(formatPercent(12, { decimals: 2 })).toBe('12.00%');
  });

  it('can omit the percent symbol', () => {
    expect(formatPercent(0, { appendSymbol: false })).toBe('0');
    expect(formatPercent(3.86, { appendSymbol: false })).toBe('3.9');
    expect(formatPercent(12, { appendSymbol: false, decimals: 2 })).toBe('12.00');
  });

  it('formats non-finite values as empty text', () => {
    expect(formatPercent(NaN)).toBe('');
    expect(formatPercent(Infinity)).toBe('');
  });
});
