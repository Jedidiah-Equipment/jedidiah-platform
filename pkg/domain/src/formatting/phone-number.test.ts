import { describe, expect, it } from 'vitest';

import { formatPhoneNumber } from './phone-number.js';

describe('formatPhoneNumber', () => {
  it('formats stored South African E.164 phone numbers for display', () => {
    expect(formatPhoneNumber('+27821234567')).toBe('+27 (0) 82 123 4567');
  });

  it('formats empty values as empty text', () => {
    expect(formatPhoneNumber(null)).toBe('');
    expect(formatPhoneNumber(undefined)).toBe('');
    expect(formatPhoneNumber('   ')).toBe('');
  });

  it('returns unrecognized values unchanged after trimming', () => {
    expect(formatPhoneNumber('  +14155552671  ')).toBe('+14155552671');
    expect(formatPhoneNumber('+27 (0) 82 123 4567')).toBe('+27 (0) 82 123 4567');
  });
});
