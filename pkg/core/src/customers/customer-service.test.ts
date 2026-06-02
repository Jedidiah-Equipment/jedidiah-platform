import { describe, expect, it } from 'vitest';

import { mapCustomer } from './customer-service.js';

describe('mapCustomer', () => {
  it('maps customer rows to customer DTOs', () => {
    const createdAt = new Date('2026-05-17T10:00:00.000Z');
    const updatedAt = new Date('2026-05-17T11:00:00.000Z');

    expect(
      mapCustomer({
        address: '12 Main Road',
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        createdAt,
        email: 'sales@acme.example',
        id: '00000000-0000-4000-8000-000000000001',
        notes: null,
        phone: '+27 11 555 0100',
        thumbnailDataUrl: null,
        updatedAt,
        vatNumber: 'VAT-123456',
      }),
    ).toEqual({
      address: '12 Main Road',
      companyName: 'Acme Mining',
      contactPerson: 'Jane Buyer',
      createdAt: createdAt.toISOString(),
      email: 'sales@acme.example',
      id: '00000000-0000-4000-8000-000000000001',
      notes: null,
      phone: '+27 11 555 0100',
      thumbnailDataUrl: null,
      updatedAt: updatedAt.toISOString(),
      vatNumber: 'VAT-123456',
    });
  });
});
