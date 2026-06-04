import type { Supplier } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  toSupplierCreateInput,
  toSupplierFormValues,
  toSupplierMinimalCreateInput,
  toSupplierUpdateInput,
} from './types.js';

const SUPPLIER_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildSupplier(overrides: Record<string, unknown> = {}): Supplier {
  return {
    id: SUPPLIER_ID,
    companyName: 'Bolt Co',
    email: 'orders@bolt.test',
    address: '2 Side Road',
    contactPerson: 'Sam',
    phone: '+27821234567',
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
      phone: null,
      thumbnailDataUrl: null,
    });
  });

  it('maps nullable supplier fields to their form shapes', () => {
    const values = toSupplierFormValues(
      buildSupplier({ email: null, address: null, contactPerson: null, phone: null, notes: null }),
    );

    expect(values).toEqual({
      address: '',
      companyName: 'Bolt Co',
      contactPerson: '',
      email: '',
      notes: '',
      phone: null,
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
      phone: null,
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

describe('toSupplierMinimalCreateInput', () => {
  it('creates the modal payload with schema defaults for non-required fields', () => {
    const input = toSupplierMinimalCreateInput({
      companyName: 'Bolt Co',
    });

    expect(input).toEqual({
      address: null,
      companyName: 'Bolt Co',
      contactPerson: null,
      email: null,
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
    });
  });
});

describe('toSupplierUpdateInput', () => {
  it('builds the whole-entity update payload', () => {
    const input = toSupplierUpdateInput(SUPPLIER_ID, {
      address: '2 Side Road',
      companyName: 'Bolt Co',
      contactPerson: 'Sam',
      email: 'Orders@Bolt.TEST',
      notes: 'Preferred',
      phone: '+27821234567',
      thumbnailDataUrl: null,
    });

    expect(input).toEqual({
      address: '2 Side Road',
      companyName: 'Bolt Co',
      contactPerson: 'Sam',
      email: 'orders@bolt.test',
      id: SUPPLIER_ID,
      notes: 'Preferred',
      phone: '+27821234567',
      thumbnailDataUrl: null,
    });
  });

  it('rejects non-E.164 supplier phone numbers', () => {
    expect(() =>
      toSupplierUpdateInput(SUPPLIER_ID, {
        address: '2 Side Road',
        companyName: 'Bolt Co',
        contactPerson: 'Sam',
        email: 'orders@bolt.test',
        notes: 'Preferred',
        phone: '0821234567',
        thumbnailDataUrl: null,
      }),
    ).toThrow('Enter a valid South African phone number');
  });
});
