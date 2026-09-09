import { describe, expect, it } from 'vitest';

import { ProductCostEstimate, ProductCostEstimateMaterialLine } from './product-cost-estimate.js';

const partId = '00000000-0000-4000-8000-000000000001';

describe('cost estimate line standard purchase length', () => {
  it('reads a Job snapshot stamped before the length was carried, rather than refusing it', () => {
    const storedBeforeTheField = {
      costFloor: 304,
      partCode: 'LTE-0027',
      partId,
      partName: '7 Core Cable',
      quantityPerUnit: 8,
      unitCost: 38,
      unitOfMeasure: 'mm',
    };

    expect(ProductCostEstimateMaterialLine.parse(storedBeforeTheField)).toMatchObject({
      standardPurchaseLengthMm: null,
    });
  });
});

describe('cost estimate labour lines', () => {
  it('reads a Job snapshot frozen as hours at a rate as one-staff days with no overheads', () => {
    const storedBeforeTheCard = {
      assemblies: [],
      basePrice: 20_000,
      complete: true,
      currencyCode: 'ZAR',
      estimatedMarginCeiling: 10_160,
      laborCostFloor: 9_840,
      laborHours: [
        { cost: 9_000, department: 'fabrication', hourlyRate: 225, hours: 40 },
        { cost: 840, department: 'paint', hourlyRate: 70, hours: 12 },
      ],
      materialCostFloor: 0,
      materialLines: [],
      missing: {
        laborHours: false,
        materialList: false,
        unattributedProductTerms: false,
        uncostedParts: [],
        unratedDepartments: [],
      },
      optionalAssemblies: [],
      partsCostFloor: 0,
      productId: partId,
      scope: 'build',
      totalCostFloor: 9_840,
    };

    expect(ProductCostEstimate.parse(storedBeforeTheCard)).toMatchObject({
      consumablesCostFloor: 0,
      laborCostFloor: 9_840,
      laborHours: [
        {
          consumablesCost: 0,
          consumablesPercentage: 0,
          daysPerStaff: 4.44,
          department: 'fabrication',
          departmentTotal: 9_000,
          hourlyRate: 225,
          hours: 40,
          laborCost: 9_000,
          staffCount: 1,
        },
        { daysPerStaff: 1.33, department: 'paint', laborCost: 840, staffCount: 1 },
      ],
      managementOverheadCostFloor: 0,
      managementOverheadPercentage: 0,
      totalCostFloor: 9_840,
    });
  });
});
