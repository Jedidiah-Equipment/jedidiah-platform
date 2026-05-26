import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Supplier, SupplierCreateInput } from './supplier.js';

describe('SupplierCreateInput', () => {
  it('normalizes supplier names', () => {
    expect(
      SupplierCreateInput.parse({
        name: '  Acme Supplies  ',
      }),
    ).toEqual({
      name: 'Acme Supplies',
    });
  });

  it('requires supplier names', () => {
    expect(() =>
      SupplierCreateInput.parse({
        name: '  ',
      }),
    ).toThrow();
  });
});

describe('Supplier', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(Supplier)).not.toThrow();
  });
});
