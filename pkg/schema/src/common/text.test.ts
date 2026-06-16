import { describe, expect, it } from 'vitest';

import { EmailAddress } from './text.js';

describe('EmailAddress', () => {
  it('normalizes valid email addresses', () => {
    expect(EmailAddress.parse('  DEAN@VANNIEKERK.ONLINE  ')).toBe('dean@vanniekerk.online');
  });

  it('rejects malformed email addresses', () => {
    expect(EmailAddress.safeParse('not-an-email').success).toBe(false);
    expect(EmailAddress.safeParse('').success).toBe(false);
  });
});
