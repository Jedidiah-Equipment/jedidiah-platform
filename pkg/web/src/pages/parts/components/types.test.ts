import { describe, expect, it } from 'vitest';

import { PartFormValues, partUnitOfMeasureOptions, toPartFormValues, toPartInput } from './types.js';

describe('part form types', () => {
  it('defaults new parts to perpetual piece tracking with nullable stock fields', () => {
    expect(toPartFormValues({ fixedSupplierId: '00000000-0000-4000-8000-000000000001' })).toMatchObject({
      isInternallyFabricated: false,
      stockTrackingMode: 'perpetual',
      storageLocation: '',
      supplierId: '00000000-0000-4000-8000-000000000001',
      unitOfMeasure: 'piece',
    });
    expect(Number.isNaN(toPartFormValues({}).minimumStock)).toBe(true);
    expect(Number.isNaN(toPartFormValues({}).averageUtilizationPercent)).toBe(true);
    expect(Number.isNaN(toPartFormValues({}).standardPurchaseLengthMm)).toBe(true);
  });

  it('preserves the unit for edited parts', () => {
    expect(
      toPartFormValues({
        initialPart: {
          averageUtilizationPercent: null,
          category: 'Hydraulics',
          code: 'HSE-001',
          description: 'Hydraulic hose',
          drawingCode: null,
          finish: 'Rubber',
          id: '00000000-0000-4000-8000-000000000002',
          isInternallyFabricated: true,
          minimumStock: 3,
          name: 'Hydraulic hose',
          standardPurchaseLengthMm: 6000,
          stockTrackingMode: 'periodic',
          storageLocation: 'Rack A',
          supplier: {
            companyName: 'Acme Supplies',
            id: '00000000-0000-4000-8000-000000000001',
          },
          supplierCode: 'SUP-001',
          supplierId: '00000000-0000-4000-8000-000000000001',
          unitOfMeasure: 'mm',
          unitOfMeasureLocked: false,
        },
      }),
    ).toMatchObject({
      isInternallyFabricated: true,
      minimumStock: 3,
      standardPurchaseLengthMm: 6000,
      stockTrackingMode: 'periodic',
      storageLocation: 'Rack A',
      supplierId: '00000000-0000-4000-8000-000000000001',
      unitOfMeasure: 'mm',
    });
  });

  it('uses shared unit labels for select options', () => {
    expect(partUnitOfMeasureOptions).toEqual([
      { label: 'Pieces', value: 'piece' },
      { label: 'Sets', value: 'set' },
      { label: 'Boxes', value: 'box' },
      { label: 'Pairs', value: 'pair' },
      { label: 'Millimetres', value: 'mm' },
      { label: 'Kilograms', value: 'kg' },
      { label: 'Litres', value: 'litre' },
    ]);
  });

  it('requires purchase length only while the form unit is millimetres', () => {
    const values = validPartFormValues();

    expect(PartFormValues.safeParse({ ...values, unitOfMeasure: 'mm' }).success).toBe(false);
    expect(PartFormValues.safeParse({ ...values, standardPurchaseLengthMm: 6000, unitOfMeasure: 'mm' }).success).toBe(
      true,
    );
    expect(
      PartFormValues.safeParse({ ...values, standardPurchaseLengthMm: 6000, unitOfMeasure: 'piece' }).success,
    ).toBe(false);
    expect(PartFormValues.safeParse(values).success).toBe(true);
  });

  it('maps empty numeric form values to null API fields', () => {
    expect(toPartInput(validPartFormValues())).toMatchObject({
      averageUtilizationPercent: null,
      minimumStock: null,
      standardPurchaseLengthMm: null,
      storageLocation: null,
    });
  });
});

function validPartFormValues() {
  return {
    ...toPartFormValues({ fixedSupplierId: '00000000-0000-4000-8000-000000000001' }),
    category: 'Bearings',
    code: 'P-100',
    description: 'Main bearing',
    finish: 'Zinc',
    name: 'Bearing',
    supplierCode: 'SUP-100',
  };
}
