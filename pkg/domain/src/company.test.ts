import { describe, expect, it } from 'vitest';

import { contactNumberE164, formatContactNumber, JEDIDIAH_CONTACT_NUMBER } from './company.js';

describe('company contact number', () => {
  it('formats the stored contact number for display', () => {
    expect(formatContactNumber()).toBe('(045) 050 0545');
    expect(formatContactNumber(JEDIDIAH_CONTACT_NUMBER)).toBe('(045) 050 0545');
  });

  it('builds an E.164 string for tel/WhatsApp links', () => {
    expect(contactNumberE164()).toBe('+27450500545');
  });
});
