import { describe, expect, it } from 'vitest';
import { formatCurrencyInputText, hasCurrencyFieldValueChanged } from './CurrencyField.js';

describe('formatCurrencyInputText', () => {
  it('formats whole-number typing with thousands separators and no decimal places', () => {
    expect(formatCurrencyInputText('1')).toBe('1');
    expect(formatCurrencyInputText('10')).toBe('10');
    expect(formatCurrencyInputText('100')).toBe('100');
    expect(formatCurrencyInputText('1000')).toBe('1 000');
    expect(formatCurrencyInputText('10000')).toBe('10 000');
    expect(formatCurrencyInputText('1000000')).toBe('1 000 000');
  });

  it('preserves user-entered decimal places without padding and caps them at two digits', () => {
    expect(formatCurrencyInputText('1.')).toBe('1.');
    expect(formatCurrencyInputText('1.2')).toBe('1.2');
    expect(formatCurrencyInputText('1.23')).toBe('1.23');
    expect(formatCurrencyInputText('1.234')).toBe('1.23');
    expect(formatCurrencyInputText('1000.5')).toBe('1 000.5');
    expect(formatCurrencyInputText('1 000,5')).toBe('1 000.5');
  });

  it('preserves a leading minus before and after digits are typed', () => {
    expect(formatCurrencyInputText('-')).toBe('-');
    expect(formatCurrencyInputText('-1')).toBe('-1');
    expect(formatCurrencyInputText('-1000.5')).toBe('-1 000.5');
  });

  it('accepts pasted currency and historical grouping formats', () => {
    expect(formatCurrencyInputText('1 000 000')).toBe('1 000 000');
    expect(formatCurrencyInputText('1,000,000.00')).toBe('1 000 000.00');
    expect(formatCurrencyInputText('R 1 000 000.00')).toBe('1 000 000.00');
  });

  it('does not turn non-numeric text into zero', () => {
    expect(formatCurrencyInputText('abc')).toBe('');
  });
});

describe('hasCurrencyFieldValueChanged', () => {
  it('treats empty currency values as unchanged', () => {
    expect(hasCurrencyFieldValueChanged(NaN, NaN)).toBe(false);
  });

  it('detects finite currency value changes', () => {
    expect(hasCurrencyFieldValueChanged(NaN, 1234.56)).toBe(true);
    expect(hasCurrencyFieldValueChanged(1234.56, NaN)).toBe(true);
    expect(hasCurrencyFieldValueChanged(1234.56, 1234.57)).toBe(true);
  });
});
