import type { Customer } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  toCustomerCreateInput,
  toCustomerFormValues,
  toCustomerMinimalCreateInput,
  toCustomerUpdateInput,
} from './types.js';

const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildCustomer(overrides: Record<string, unknown> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    companyName: 'Acme',
    email: 'sales@acme.test',
    address: '1 Main Street',
    contactPerson: 'Jane',
    phone: '0123',
    notes: 'VIP',
    thumbnailDataUrl: null,
    vatNumber: 'VAT-123456',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Customer;
}

describe('toCustomerFormValues', () => {
  it('returns blank defaults when no customer is provided', () => {
    expect(toCustomerFormValues()).toEqual({
      address: '',
      companyName: '',
      contactPerson: '',
      email: '',
      notes: '',
      phone: '',
      thumbnailDataUrl: null,
      vatNumber: '',
    });
  });

  it('collapses null fields to empty strings', () => {
    const values = toCustomerFormValues(
      buildCustomer({ email: null, address: null, contactPerson: null, phone: null, notes: null, vatNumber: null }),
    );

    expect(values).toEqual({
      address: '',
      companyName: 'Acme',
      contactPerson: '',
      email: '',
      notes: '',
      phone: '',
      thumbnailDataUrl: null,
      vatNumber: '',
    });
  });
});

describe('toCustomerCreateInput', () => {
  it('coalesces empty strings to null and lowercases the email', () => {
    const input = toCustomerCreateInput({
      address: '',
      companyName: 'Acme',
      contactPerson: '',
      email: 'Sales@Acme.TEST',
      notes: '',
      phone: '',
      thumbnailDataUrl: null,
      vatNumber: '',
    });

    expect(input).toEqual({
      address: null,
      companyName: 'Acme',
      contactPerson: null,
      email: 'sales@acme.test',
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
      vatNumber: null,
    });
  });

  it('preserves provided values', () => {
    const input = toCustomerCreateInput({
      address: '1 Main Street',
      companyName: 'Acme',
      contactPerson: 'Jane',
      email: 'jane@acme.test',
      notes: 'VIP',
      phone: '0123',
      thumbnailDataUrl: null,
      vatNumber: 'VAT-123456',
    });

    expect(input.address).toBe('1 Main Street');
    expect(input.contactPerson).toBe('Jane');
    expect(input.vatNumber).toBe('VAT-123456');
  });
});

describe('toCustomerMinimalCreateInput', () => {
  it('creates the modal payload with schema defaults for non-required fields', () => {
    const input = toCustomerMinimalCreateInput({
      companyName: 'Acme',
    });

    expect(input).toEqual({
      address: null,
      companyName: 'Acme',
      contactPerson: null,
      email: null,
      notes: null,
      phone: null,
      thumbnailDataUrl: null,
      vatNumber: null,
    });
  });
});

describe('toCustomerUpdateInput', () => {
  it('builds the whole-entity update payload', () => {
    const input = toCustomerUpdateInput(CUSTOMER_ID, {
      address: '1 Main Street',
      companyName: 'Acme',
      contactPerson: 'Jane',
      email: 'Sales@Acme.TEST',
      notes: 'VIP',
      phone: '0123',
      thumbnailDataUrl: null,
      vatNumber: 'VAT-123456',
    });

    expect(input).toEqual({
      address: '1 Main Street',
      companyName: 'Acme',
      contactPerson: 'Jane',
      email: 'sales@acme.test',
      id: CUSTOMER_ID,
      notes: 'VIP',
      phone: '0123',
      thumbnailDataUrl: null,
      vatNumber: 'VAT-123456',
    });
  });
});
