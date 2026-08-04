import { describe, expect, it } from 'vitest';
import { formatNumberFieldValue, hasNumberFieldValueChanged, parseNumberFieldValue } from './NumberField.js';

describe('formatNumberFieldValue', () => {
  it('formats empty numeric values as blank text', () => {
    expect(formatNumberFieldValue(NaN)).toBe('');
  });

  it('formats finite numeric values as plain input text', () => {
    expect(formatNumberFieldValue(0)).toBe('0');
    expect(formatNumberFieldValue(1000000)).toBe('1 000 000');
    expect(formatNumberFieldValue(12.5)).toBe('12.5');
    expect(formatNumberFieldValue(0.1 + 0.2)).toBe('0.3');
    expect(formatNumberFieldValue(1e-7)).toBe('0.0000001');
    expect(formatNumberFieldValue(12.5, 2)).toBe('12.50');
  });
});

describe('parseNumberFieldValue', () => {
  it('returns NaN for blank input by default', () => {
    expect(Number.isNaN(parseNumberFieldValue(''))).toBe(true);
    expect(Number.isNaN(parseNumberFieldValue('   '))).toBe(true);
  });

  it('uses a caller-provided blank value when provided', () => {
    expect(parseNumberFieldValue('', 0)).toBe(0);
  });

  it('parses numeric input text', () => {
    expect(parseNumberFieldValue('12')).toBe(12);
    expect(parseNumberFieldValue('12.5')).toBe(12.5);
  });

  it('parses grouped numeric input text', () => {
    expect(parseNumberFieldValue('1 000 000')).toBe(1000000);
    expect(parseNumberFieldValue('1\u00a0000\u00a0000')).toBe(1000000);
    expect(parseNumberFieldValue('1,000,000')).toBe(1000000);
    expect(parseNumberFieldValue('1000,5')).toBe(1000.5);
  });
});

describe('formatNumberFieldValue fraction digits', () => {
  it('formats a value with more fraction digits than Intl accepts', () => {
    // Intl.NumberFormat throws above 100 fraction digits, and `1e-101` parses straight out of the field.
    expect(() => formatNumberFieldValue(1e-101)).not.toThrow();
    expect(formatNumberFieldValue(0.125)).toBe('0.125');
  });
});

describe('hasNumberFieldValueChanged', () => {
  it('treats empty numeric values as unchanged', () => {
    expect(hasNumberFieldValueChanged(NaN, NaN)).toBe(false);
  });

  it('detects finite number changes', () => {
    expect(hasNumberFieldValueChanged(NaN, 0)).toBe(true);
    expect(hasNumberFieldValueChanged(0, 1)).toBe(true);
  });
});
