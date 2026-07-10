import { createUserAccessSummary } from '@pkg/domain';
import { CustomerListResult } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  FindCustomersInput,
  FindCustomersResponse,
  findCustomersDefinition,
  toCoreCustomerListInput,
  toFindCustomersResponse,
} from './find-customers.js';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';

describe('findCustomers v2 contract', () => {
  test('describes the lightweight find-before-get workflow', () => {
    expect(findCustomersDefinition.name).toBe('findCustomers');
    expect(findCustomersDefinition.description).toContain('lightweight');
    expect(findCustomersDefinition.description).toContain('getCustomer');
    expect(findCustomersDefinition.anyOfPermissions).toEqual(['customer:read', 'quote:read', 'quote:create']);
  });

  test('maps search onto an unpaged Customer read', () => {
    const input = FindCustomersInput.parse({ search: 'acme' });

    expect(toCoreCustomerListInput(input)).toEqual({
      columnFilters: {},
      page: 1,
      pageSize: 0,
      search: 'acme',
      sortBy: 'companyName',
      sortDirection: 'asc',
    });
  });

  test('returns lightweight Customer identity and contact fields', () => {
    const result = CustomerListResult.parse({
      items: [
        {
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
        },
      ],
      sortBy: 'companyName',
      sortDirection: 'asc',
      total: 1,
    });

    const response = toFindCustomersResponse(
      result,
      createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    );

    expect(FindCustomersResponse.parse(response)).toEqual(response);
    expect(response).toEqual([
      {
        companyName: 'Acme Mining',
        contactPerson: 'A. Person',
        email: 'buyer@example.com',
        id: CUSTOMER_ID,
        links: { app: `/customers/${CUSTOMER_ID}/edit` },
        phone: '+27110000000',
        vatNumber: 'VAT-1',
      },
    ]);
    expect(JSON.stringify(response)).not.toMatch(/address|notes|thumbnail/);
    expect(toFindCustomersResponse(result, createUserAccessSummary({ role: 'sales', userId: 'test-user-id' }))).toEqual(
      [
        {
          companyName: 'Acme Mining',
          contactPerson: 'A. Person',
          email: 'buyer@example.com',
          id: CUSTOMER_ID,
          phone: '+27110000000',
          vatNumber: 'VAT-1',
        },
      ],
    );
  });
});
