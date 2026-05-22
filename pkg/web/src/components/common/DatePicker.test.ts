import { describe, expect, it } from 'vitest';

import { formatDatePickerDisplayValue, formatDatePickerValue, parseDatePickerValue } from './DatePicker.js';

describe('parseDatePickerValue', () => {
  it('parses a yyyy-MM-dd date', () => {
    expect(formatDatePickerValue(parseDatePickerValue('2026-05-22') ?? new Date(NaN))).toBe('2026-05-22');
  });

  it('treats an empty value as no selected date', () => {
    expect(parseDatePickerValue('')).toBeNull();
  });

  it('rejects invalid date strings', () => {
    expect(parseDatePickerValue('2026-02-31')).toBeNull();
    expect(parseDatePickerValue('not-a-date')).toBeNull();
    expect(parseDatePickerValue('2026-5-2')).toBeNull();
  });
});

describe('formatDatePickerValue', () => {
  it('formats a date as yyyy-MM-dd', () => {
    expect(formatDatePickerValue(new Date(2026, 4, 22))).toBe('2026-05-22');
  });
});

describe('formatDatePickerDisplayValue', () => {
  it('formats the selected date with the shared short date format', () => {
    expect(formatDatePickerDisplayValue(new Date(2026, 4, 22))).toBe('May 22, 2026');
  });
});
