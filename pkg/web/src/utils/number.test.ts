import { describe, expect, it } from 'vitest';
import { formatCurrency } from './number.js';

describe('formatCurrency', () => {
  it('formats finite values with grouping and without padded decimals', () => {
    expect(formatCurrency(1)).toBe('1');
    expect(formatCurrency(1000)).toBe('1,000');
    expect(formatCurrency(1000.5)).toBe('1,000.5');
    expect(formatCurrency(1000.56)).toBe('1,000.56');
  });

  it('formats non-finite values as empty text', () => {
    expect(formatCurrency(NaN)).toBe('');
    expect(formatCurrency(Infinity)).toBe('');
  });
});
