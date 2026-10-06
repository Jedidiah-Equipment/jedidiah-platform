import { describe, expect, it } from 'vitest';

import {
  contactNumberE164,
  formatContactNumber,
  JEDIDIAH_CONTACT_NUMBER,
  JEDIDIAH_WHATSAPP_NUMBER,
} from './company.js';

describe('company contact number', () => {
  it('formats the stored contact number for display', () => {
    expect(formatContactNumber()).toBe('(083) 331 9183');
    expect(formatContactNumber(JEDIDIAH_CONTACT_NUMBER)).toBe('(083) 331 9183');
  });

  it('builds an E.164 string for tel/WhatsApp links', () => {
    expect(contactNumberE164()).toBe('+27833319183');
    expect(contactNumberE164(JEDIDIAH_WHATSAPP_NUMBER)).toBe('+27824194464');
  });
});
