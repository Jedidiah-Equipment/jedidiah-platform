import * as customersCore from '@pkg/core';
import { Customer } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

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
  test('normalizes Customer input, creates it as the actor, and returns linked details', async () => {
    const input = CreateCustomerInput.parse({
      address: null,
      companyName: ' Acme Mining ',
      contactPerson: ' Jane Buyer ',
      notes: ' Needs follow-up ',
      vatNumber: ' VAT-123 ',
    });
    const coreInput = toCoreCustomerCreateInput(input);
    const createSpy = vi.spyOn(customersCore, 'createCustomer').mockResolvedValue(customer);

    await expect(createCustomerDefinition.handler(input, createContext())).resolves.toEqual(
      toCreateCustomerResponse(customer),
    );

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
    expect(createSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: coreInput,
    });

    const response = toCreateCustomerResponse(customer);
    expect(CreateCustomerResponse.parse(response)).toEqual(response);
    expect(response.links.app).toBe(`/customers/${CUSTOMER_ID}/edit`);
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(createCustomerDefinition.anyOfPermissions).toEqual(['customer:create']);
    expect(createCustomerDefinition.description).toContain('standalone Customer');
    expect(createCustomerDefinition.description).toContain('createQuote');
    expect(() => z.toJSONSchema(CreateCustomerInput)).not.toThrow();
  });

  test('rejects execution without an authenticated actor', async () => {
    await expect(
      createCustomerDefinition.handler({ companyName: 'Acme Mining' }, createContext(false)),
    ).rejects.toThrow('authenticated user');
  });
});
