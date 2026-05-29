import type { Supplier } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { toSupplierCreateInput, toSupplierFormValues } from './types.js';

const SUPPLIER_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildSupplier(overrides: Record<string, unknown> = {}): Supplier {
  return {
    id: SUPPLIER_ID,
    companyName: 'Bolt Co',
    email: 'orders@bolt.test',
    address: '2 Side Road',
    contactPerson: 'Sam',
    phone: '0456',
    notes: 'Preferred',
    thumbnailDataUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Supplier;
}

describe('toSupplierFormValues', () => {
  it('returns blank defaults when no supplier is provided', () => {
    expect(toSupplierFormValues()).toEqual({
      address: '',
      companyName: '',
      contactPerson: '',
      email: '',
      notes: '',
      phone: '',
      thumbnailDataUrl: null,
    });
  });

  it('collapses null fields to empty strings', () => {
    const values = toSupplierFormValues(
      buildSupplier({ email: null, address: null, contactPerson: null, phone: null, notes: null }),
    );

    expect(values).toEqual({
      address: '',
      companyName: 'Bolt Co',
      contactPerson: '',
      email: '',
      notes: '',
      phone: '',
      thumbnailDataUrl: null,
    });
  });
});

describe('toSupplierCreateInput', () => {
  it('coalesces empty strings to null and lowercases the email', () => {
    const input = toSupplierCreateInput({
      address: '',
      companyName: 'Bolt Co',
      contactPerson: '',
      email: 'Orders@Bolt.TEST',
      notes: '',
      phone: '',
      thumbnailDataUrl: null,
    });

    expect(input).toEqual({
      address: null,
      companyName: 'Bolt Co',
      contactPerson: null,
      email: 'orders@bolt.test',
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
    });
  });
});
