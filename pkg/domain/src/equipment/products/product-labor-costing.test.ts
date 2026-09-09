import { describe, expect, it } from 'vitest';

import { costProductLabor, productLaborTotal } from './product-labor-costing.js';

const spreadsheetCard = {
  hoursPerWorkingDay: 9,
  managementOverheadPercentage: 50,
  rates: [
    { consumablesPercentage: 60, costToCompanyRate: 220, department: 'fabrication' as const },
    { consumablesPercentage: 60, costToCompanyRate: 200, department: 'supply' as const },
    { consumablesPercentage: 40, costToCompanyRate: 65, department: 'paint' as const },
    { consumablesPercentage: 20, costToCompanyRate: 80, department: 'assembly' as const },
    { consumablesPercentage: null, costToCompanyRate: null, department: 'workshop' as const },
  ],
};

describe('costProductLabor', () => {
  it('reproduces the labour costing spreadsheet column for column', () => {
    const costing = costProductLabor(
      [
        { daysPerStaff: 1, department: 'assembly', staffCount: 3 },
        { daysPerStaff: 2, department: 'paint', staffCount: 3 },
        { daysPerStaff: 5, department: 'fabrication', staffCount: 1 },
        { daysPerStaff: 2, department: 'supply', staffCount: 3 },
      ],
      spreadsheetCard,
    );

    expect(costing.lines).toEqual([
      {
        consumablesCost: 432,
        consumablesPercentage: 20,
        daysPerStaff: 1,
        department: 'assembly',
        departmentTotal: 2_592,
        hourlyRate: 80,
        hours: 9,
        laborCost: 2_160,
        staffCount: 3,
      },
      expect.objectContaining({ consumablesCost: 1_404, department: 'paint', hours: 18, laborCost: 3_510 }),
      expect.objectContaining({ consumablesCost: 5_940, department: 'fabrication', hours: 45, laborCost: 9_900 }),
      expect.objectContaining({ consumablesCost: 6_480, department: 'supply', hours: 18, laborCost: 10_800 }),
    ]);
    expect(costing).toMatchObject({
      consumablesCostFloor: 14_256,
      laborCostFloor: 26_370,
      managementOverheadCostFloor: 13_185,
      managementOverheadPercentage: 50,
      unratedDepartments: [],
    });
    expect(productLaborTotal(costing)).toBe(53_811);
  });

  it('prices an unrated Department at zero and names it, whether its rate is blank or zero', () => {
    const costing = costProductLabor(
      [
        { daysPerStaff: 1, department: 'workshop', staffCount: 2 },
        { daysPerStaff: 1, department: 'assembly', staffCount: 1 },
      ],
      {
        ...spreadsheetCard,
        rates: spreadsheetCard.rates.map((rate) =>
          rate.department === 'assembly' ? { ...rate, costToCompanyRate: 0 } : rate,
        ),
      },
    );

    expect(costing.lines).toEqual([
      expect.objectContaining({
        consumablesCost: 0,
        consumablesPercentage: 0,
        department: 'workshop',
        departmentTotal: 0,
        hourlyRate: 0,
        hours: 9,
        laborCost: 0,
      }),
      expect.objectContaining({ department: 'assembly', hourlyRate: 0, laborCost: 0 }),
    ]);
    expect(costing.unratedDepartments).toEqual(['workshop', 'assembly']);
    expect(productLaborTotal(costing)).toBe(0);
  });

  it('derives hours from the card’s hours per working day', () => {
    const costing = costProductLabor([{ daysPerStaff: 1.5, department: 'assembly', staffCount: 2 }], {
      ...spreadsheetCard,
      hoursPerWorkingDay: 8,
      managementOverheadPercentage: 10,
    });

    expect(costing.lines[0]).toMatchObject({ consumablesCost: 384, hours: 12, laborCost: 1_920 });
    expect(costing.managementOverheadCostFloor).toBe(192);
    expect(productLaborTotal(costing)).toBe(2_496);
  });
});
