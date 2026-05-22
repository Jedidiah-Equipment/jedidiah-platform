import { describe, expect, it } from 'vitest';
import { formatNumberFieldValue, hasNumberFieldValueChanged, parseNumberFieldValue } from './NumberField.js';

describe('formatNumberFieldValue', () => {
  it('formats empty numeric values as blank text', () => {
    expect(formatNumberFieldValue(NaN)).toBe('');
  });

  it('formats finite numeric values as plain input text', () => {
    expect(formatNumberFieldValue(0)).toBe('0');
    expect(formatNumberFieldValue(12.5)).toBe('12.5');
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
