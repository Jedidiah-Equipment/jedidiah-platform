import { describe, expect, it } from 'vitest';

import { partUnitOfMeasureOptions, toPartFormValues } from './types.js';

describe('part form types', () => {
  it('defaults new parts to quantity units', () => {
    expect(toPartFormValues({ fixedSupplierId: '00000000-0000-4000-8000-000000000001' })).toMatchObject({
      supplierId: '00000000-0000-4000-8000-000000000001',
      unitOfMeasure: 'quantity',
    });
  });

  it('preserves the unit for edited parts', () => {
    expect(
      toPartFormValues({
        initialPart: {
          category: 'Hydraulics',
          code: 'HSE-001',
          description: 'Hydraulic hose',
          drawingCode: null,
          finish: 'Rubber',
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Hydraulic hose',
          supplier: {
            companyName: 'Acme Supplies',
            id: '00000000-0000-4000-8000-000000000001',
          },
          supplierCode: 'SUP-001',
          supplierId: '00000000-0000-4000-8000-000000000001',
          unitOfMeasure: 'mm',
        },
      }),
    ).toMatchObject({
      supplierId: '00000000-0000-4000-8000-000000000001',
      unitOfMeasure: 'mm',
    });
  });

  it('uses shared unit labels for select options', () => {
    expect(partUnitOfMeasureOptions).toEqual([
      { label: 'Quantity', value: 'quantity' },
      { label: 'Millimetres', value: 'mm' },
    ]);
  });
});
