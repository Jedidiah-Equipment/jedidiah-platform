import { describe, expect, it } from 'vitest';

import { mapSupplier } from './supplier-service.js';

describe('mapSupplier', () => {
  it('maps supplier rows to supplier DTOs', () => {
    expect(
      mapSupplier({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Acme Supplies',
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Acme Supplies',
    });
  });
});
