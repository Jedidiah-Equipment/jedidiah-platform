import { describe, expect, it } from 'vitest';

import { recipientLabel } from './checkout.js';

describe('recipientLabel', () => {
  it('names a Contracting-only Recipient with the role, so a same-named Equipment person stays distinct', () => {
    expect(recipientLabel({ contractingRole: null, name: 'Ayanda Mokoena' })).toBe('Ayanda Mokoena');
    expect(recipientLabel({ contractingRole: 'driver', name: 'Ayanda Mokoena' })).toBe('Ayanda Mokoena · Driver');
    expect(recipientLabel({ contractingRole: 'mechanic', name: 'Sipho Dube' })).toBe('Sipho Dube · Mechanic');
  });
});
