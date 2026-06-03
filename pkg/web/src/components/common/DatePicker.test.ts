import { describe, expect, it } from 'vitest';

import {
  formatDatePickerDisplayValue,
  formatDatePickerInputValue,
  formatDatePickerValue,
  parseDatePickerInputValue,
  parseDatePickerValue,
} from './DatePicker.js';

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

describe('formatDatePickerInputValue', () => {
  it('formats a wire date for text entry display', () => {
    expect(formatDatePickerInputValue('2026-05-22')).toBe('May 22, 2026');
  });

  it('leaves invalid wire values blank', () => {
    expect(formatDatePickerInputValue('2026-02-31')).toBe('');
  });
});

describe('parseDatePickerInputValue', () => {
  it('parses the shared short date format back to a wire date', () => {
    expect(parseDatePickerInputValue('May 22, 2026')).toBe('2026-05-22');
  });

  it('also accepts direct wire-date entry', () => {
    expect(parseDatePickerInputValue('2026-05-22')).toBe('2026-05-22');
  });

  it('accepts common typed dates through the shared parser', () => {
    expect(parseDatePickerInputValue('22 May 2026')).toBe('2026-05-22');
    expect(parseDatePickerInputValue('18/06/2026')).toBe('2026-06-18');
  });

  it('rejects invalid typed dates', () => {
    expect(parseDatePickerInputValue('May 35, 2026')).toBeNull();
    expect(parseDatePickerInputValue('Jun 12, 20')).toBeNull();
  });
});
