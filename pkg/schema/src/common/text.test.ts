import { describe, expect, it } from 'vitest';

import { EmailAddress } from './text.js';

describe('EmailAddress', () => {
  it('normalizes valid email addresses', () => {
    expect(EmailAddress.parse('  DEAN@JEDIDIAHEQUIPMENT.CO.ZA  ')).toBe('dean@jedidiahequipment.co.za');
  });

  it('rejects malformed email addresses', () => {
    expect(EmailAddress.safeParse('not-an-email').success).toBe(false);
    expect(EmailAddress.safeParse('').success).toBe(false);
  });
});
