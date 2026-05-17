import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Customer, CustomerCreateInput } from './customer.js';

describe('CustomerCreateInput', () => {
  it('normalizes customer fields', () => {
    expect(
      CustomerCreateInput.parse({
        address: '  12 Main Road\nJohannesburg  ',
        companyName: '  Acme Mining  ',
        contactPerson: '  Jane Buyer  ',
        email: '  SALES@ACME.EXAMPLE  ',
        notes: '  Prefers email  ',
        phone: '  +27 11 555 0100  ',
      }),
    ).toEqual({
      address: '12 Main Road\nJohannesburg',
      companyName: 'Acme Mining',
      contactPerson: 'Jane Buyer',
      email: 'sales@acme.example',
      notes: 'Prefers email',
      phone: '+27 11 555 0100',
    });
  });

  it('stores blank optional fields as null', () => {
    expect(
      CustomerCreateInput.parse({
        address: '  ',
        companyName: 'Acme Mining',
        contactPerson: '',
        email: 'sales@acme.example',
        notes: '  ',
        phone: '',
      }),
    ).toMatchObject({
      address: null,
      contactPerson: null,
      notes: null,
      phone: null,
    });
  });

  it('requires company name and a valid email', () => {
    expect(() =>
      CustomerCreateInput.parse({
        companyName: '  ',
        email: 'not-an-email',
      }),
    ).toThrow();
  });
});

describe('Customer', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Customer)).not.toThrow();
  });
});
