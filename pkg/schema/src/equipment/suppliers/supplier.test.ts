import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Supplier, SupplierCreateInput, SupplierMergeInput, SupplierMergePreview } from './supplier.js';

describe('SupplierCreateInput', () => {
  it('normalizes supplier values', () => {
    expect(
      SupplierCreateInput.parse({
        address: '  12 Main Road  ',
        companyName: '  Acme Supplies  ',
        contactPerson: '  Jane Buyer  ',
        email: '  SALES@ACME.EXAMPLE  ',
        notes: '  Prefers email  ',
        phone: '  +27115550100  ',
      }),
    ).toEqual({
      address: '12 Main Road',
      companyName: 'Acme Supplies',
      contactPerson: 'Jane Buyer',
      email: 'sales@acme.example',
      notes: 'Prefers email',
      phone: '+27115550100',
      thumbnailDataUrl: null,
    });
  });

  it('stores blank optional text fields as null', () => {
    expect(
      SupplierCreateInput.parse({
        address: ' ',
        companyName: 'Acme Supplies',
        contactPerson: '',
        email: '',
        notes: ' ',
        phone: null,
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

  it('defaults omitted supplier phone numbers to null', () => {
    expect(
      SupplierCreateInput.parse({
        companyName: 'Acme Supplies',
      }),
    ).toMatchObject({
      phone: null,
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

  it('requires valid South African supplier phone numbers', () => {
    expect(() =>
      SupplierCreateInput.parse({
        companyName: 'Acme Supplies',
        phone: '0821234567',
      }),
    ).toThrow('Enter a valid South African phone number');
  });
});

describe('Supplier', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Supplier)).not.toThrow();
  });
});

describe('supplier merge schemas', () => {
  it('accepts distinct merge ids and non-negative preview counts', () => {
    expect(
      SupplierMergeInput.parse({
        sourceId: '00000000-0000-4000-8000-000000000001',
        targetId: '00000000-0000-4000-8000-000000000002',
      }),
    ).toEqual({
      sourceId: '00000000-0000-4000-8000-000000000001',
      targetId: '00000000-0000-4000-8000-000000000002',
    });
    expect(SupplierMergePreview.parse({ partCount: 14, purchaseOrderCount: 3 })).toEqual({
      partCount: 14,
      purchaseOrderCount: 3,
    });
  });
});
