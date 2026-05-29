import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Supplier, SupplierCreateInput } from './supplier.js';

describe('SupplierCreateInput', () => {
  it('normalizes supplier values', () => {
    expect(
      SupplierCreateInput.parse({
        address: '  12 Main Road  ',
        companyName: '  Acme Supplies  ',
        contactPerson: '  Jane Buyer  ',
        email: '  SALES@ACME.EXAMPLE  ',
        notes: '  Prefers email  ',
        phone: '  +27 11 555 0100  ',
      }),
    ).toEqual({
      address: '12 Main Road',
      companyName: 'Acme Supplies',
      contactPerson: 'Jane Buyer',
      email: 'sales@acme.example',
      notes: 'Prefers email',
      phone: '+27 11 555 0100',
      thumbnailDataUrl: null,
    });
  });

  it('stores blank optional fields as null', () => {
    expect(
      SupplierCreateInput.parse({
        address: ' ',
        companyName: 'Acme Supplies',
        contactPerson: '',
        email: '',
        notes: ' ',
        phone: '',
      }),
    ).toEqual({
      address: null,
      companyName: 'Acme Supplies',
      contactPerson: null,
      email: null,
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
    });
  });

  it('requires supplier company names', () => {
    expect(() =>
      SupplierCreateInput.parse({
        companyName: '  ',
      }),
    ).toThrow();
  });

  it('requires valid supplier emails', () => {
    expect(() =>
      SupplierCreateInput.parse({
        companyName: 'Acme Supplies',
        email: 'not-an-email',
      }),
    ).toThrow('Enter a valid email address');
  });
});

describe('Supplier', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Supplier)).not.toThrow();
  });
});
