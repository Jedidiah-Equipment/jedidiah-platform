import * as customersCore from '@pkg/core';
import { Customer } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import {
  PatchCustomerInput,
  PatchCustomerResponse,
  patchCustomerDefinition,
  toCoreCustomerPatchInput,
  toPatchCustomerResponse,
} from './patch-customer.js';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';

const customer = Customer.parse({
  address: null,
  companyName: 'Acme Mining',
  contactPerson: 'Jane Buyer',
  createdAt: '2026-07-10T08:00:00.000Z',
  email: null,
  id: CUSTOMER_ID,
  notes: 'Updated note',
  phone: '+27110000000',
  thumbnailDataUrl: null,
  updatedAt: '2026-07-10T09:00:00.000Z',
  vatNumber: 'VAT-123',
});

function createContext(): AiContext {
  return {
    db: {} as AiContext['db'],
    session: {
      user: {
        assistantEnabled: true,
        email: 'sales@example.com',
        id: 'test-user-id',
      },
    },
  } as AiContext;
}

describe('patchCustomer contract', () => {
  test('passes only named Customer changes to core and returns linked details', async () => {
    const input = PatchCustomerInput.parse({ id: CUSTOMER_ID, email: null, notes: ' Updated note ' });
    const coreInput = toCoreCustomerPatchInput(input);
    const patchSpy = vi.spyOn(customersCore, 'patchCustomer').mockResolvedValue(customer);

    await expect(patchCustomerDefinition.handler(input, createContext())).resolves.toEqual(
      toPatchCustomerResponse(customer),
    );

    expect(coreInput).toEqual({ id: CUSTOMER_ID, email: null, notes: 'Updated note' });
    expect(coreInput).not.toHaveProperty('companyName');
    expect(patchSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      db: expect.any(Object),
      input: coreInput,
    });

    const response = toPatchCustomerResponse(customer);
    expect(PatchCustomerResponse.parse(response)).toEqual(response);
    expect(response.links.app).toBe(`/customers/${CUSTOMER_ID}/edit`);
    expect(patchCustomerDefinition.anyOfPermissions).toEqual(['customer:update']);
    expect(patchCustomerDefinition.description).toContain('only the fields');
    expect(patchCustomerDefinition.description).toContain('findCustomers');
    expect(() => z.toJSONSchema(PatchCustomerInput)).not.toThrow();
  });
});
