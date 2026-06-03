import { describe, expect, it } from 'vitest';

import { NullablePhoneNumber, PhoneNumber } from './phone-number.js';

describe('PhoneNumber', () => {
  it('accepts valid South African E.164 numbers', () => {
    expect(PhoneNumber.parse('+27821234567')).toBe('+27821234567');
    expect(PhoneNumber.parse('  +27821234567  ')).toBe('+27821234567');
    expect(NullablePhoneNumber.parse(null)).toBeNull();
  });

  it('rejects non-ZA, malformed, and wrong-length numbers', () => {
    expect(PhoneNumber.safeParse('+14155552671').success).toBe(false);
    expect(PhoneNumber.safeParse('0821234567').success).toBe(false);
    expect(PhoneNumber.safeParse('+2708123456').success).toBe(false);
    expect(PhoneNumber.safeParse('+2782123456').success).toBe(false);
    expect(PhoneNumber.safeParse('+278212345678').success).toBe(false);
  });
});
