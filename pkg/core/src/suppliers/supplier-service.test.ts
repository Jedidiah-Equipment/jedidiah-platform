import { describe, expect, it } from 'vitest';

import { mapSupplier } from './supplier-service.js';

describe('mapSupplier', () => {
  it('maps supplier rows to supplier DTOs', () => {
    expect(
      mapSupplier({
        address: null,
        companyName: 'Acme Supplies',
        contactPerson: 'Jane Buyer',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        email: 'sales@acme.example',
        id: '00000000-0000-4000-8000-000000000001',
        notes: null,
        phone: '+27115550100',
        thumbnailDataUrl: null,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ).toEqual({
      address: null,
      companyName: 'Acme Supplies',
      contactPerson: 'Jane Buyer',
      createdAt: '2026-01-01T00:00:00.000Z',
      email: 'sales@acme.example',
      id: '00000000-0000-4000-8000-000000000001',
      notes: null,
      phone: '+27115550100',
      thumbnailDataUrl: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
});
