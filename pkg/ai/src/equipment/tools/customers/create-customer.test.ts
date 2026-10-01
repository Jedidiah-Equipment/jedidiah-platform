import { Customer } from '@pkg/schema/equipment';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/equipment/context.js';

import {
  CreateCustomerInput,
  CreateCustomerResponse,
  createCustomerDefinition,
  toCoreCustomerCreateInput,
  toCreateCustomerResponse,
} from './create-customer.js';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';

const customer = Customer.parse({
  address: null,
  companyName: 'Acme Mining',
  contactPerson: 'Jane Buyer',
  createdAt: '2026-07-10T08:00:00.000Z',
  email: null,
  id: CUSTOMER_ID,
  notes: 'Needs follow-up',
  phone: null,
  thumbnailDataUrl: 'data:image/webp;base64,YQ==',
  updatedAt: '2026-07-10T09:00:00.000Z',
  vatNumber: 'VAT-123',
});

function createContext(session = true): AiContext {
  return {
    db: {} as AiContext['db'],
    session: session
      ? {
          user: {
            assistantEnabled: true,
            email: 'sales@example.com',
            id: 'test-user-id',
          },
        }
      : null,
  } as AiContext;
}

describe('createCustomer contract', () => {
  test('normalizes Customer input and projects linked details', () => {
    const input = CreateCustomerInput.parse({
      address: null,
      companyName: ' Acme Mining ',
      contactPerson: ' Jane Buyer ',
      notes: ' Needs follow-up ',
      vatNumber: ' VAT-123 ',
    });
    const coreInput = toCoreCustomerCreateInput(input);
    expect(coreInput).toEqual({
      address: null,
      companyName: 'Acme Mining',
      contactPerson: 'Jane Buyer',
      email: null,
      notes: 'Needs follow-up',
      phone: null,
      thumbnailDataUrl: null,
      vatNumber: 'VAT-123',
    });
    const response = toCreateCustomerResponse(customer);
    expect(CreateCustomerResponse.parse(response)).toEqual(response);
    expect(response.links.app).toBe(`/equipment/customers/${CUSTOMER_ID}/edit`);
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(() => z.toJSONSchema(CreateCustomerInput)).not.toThrow();
  });

  test('rejects execution without an authenticated actor', async () => {
    await expect(
      createCustomerDefinition.handler({ companyName: 'Acme Mining' }, createContext(false)),
    ).rejects.toThrow('authenticated user');
  });
});
