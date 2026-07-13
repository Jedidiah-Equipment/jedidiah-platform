import { Customer } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { GetCustomerInput, GetCustomerResponse, getCustomerDefinition, toGetCustomerResponse } from './get-customer.js';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';

const customer = Customer.parse({
  address: '1 Quarry Road',
  companyName: 'Acme Mining',
  contactPerson: 'A. Person',
  createdAt: '2026-07-10T08:00:00.000Z',
  email: 'buyer@example.com',
  id: CUSTOMER_ID,
  notes: 'Internal note',
  phone: '+27110000000',
  thumbnailDataUrl: 'data:image/webp;base64,YQ==',
  updatedAt: '2026-07-10T09:00:00.000Z',
  vatNumber: 'VAT-1',
});

describe('getCustomer contract', () => {
  test('requires a Customer UUID and describes the find follow-up', () => {
    expect(GetCustomerInput.parse({ id: CUSTOMER_ID })).toEqual({ id: CUSTOMER_ID });
    expect(() => GetCustomerInput.parse({ id: 'bad-id' })).toThrow();
    expect(getCustomerDefinition.description).toContain('findCustomers');
  });

  test('returns full Customer details without thumbnail data', () => {
    const response = toGetCustomerResponse(customer);

    expect(GetCustomerResponse.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      address: '1 Quarry Road',
      companyName: 'Acme Mining',
      id: CUSTOMER_ID,
      links: { app: `/customers/${CUSTOMER_ID}/edit` },
      notes: 'Internal note',
    });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
  });
});
