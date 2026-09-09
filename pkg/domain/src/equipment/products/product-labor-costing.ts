import type { LaborDepartmentRate, LaborRateCard, WorkItemDepartment } from '@pkg/schema/equipment';

export type ProductLaborLineInput = {
  daysPerStaff: number;
  department: WorkItemDepartment;
  staffCount: number;
};

/** The Labor Rate Card fields product costing reads; billing rates stay out of it. */
export type ProductLaborRateCard = Pick<LaborRateCard, 'hoursPerWorkingDay' | 'managementOverheadPercentage'> & {
  rates: readonly Pick<LaborDepartmentRate, 'consumablesPercentage' | 'costToCompanyRate' | 'department'>[];
};

export type ProductLaborCostingLine = ProductLaborLineInput & {
  consumablesCost: number;
  consumablesPercentage: number;
  departmentTotal: number;
  hourlyRate: number;
  hours: number;
  laborCost: number;
};

export type ProductLaborCosting = {
  consumablesCostFloor: number;
  laborCostFloor: number;
  lines: ProductLaborCostingLine[];
  managementOverheadCostFloor: number;
  managementOverheadPercentage: number;
  unratedDepartments: WorkItemDepartment[];
};

/**
 * Product Labor Hours priced at the Labor Rate Card, column for column as the costing spreadsheet:
 * hours per staff member = days × hours per working day; labour cost = hours × staff × cost-to-company
 * rate; consumables = labour cost × the Department's percentage; management overhead = the card's
 * percentage of summed labour cost before consumables. A blank or zero rate prices at zero and names
 * its Department so the caller flags the estimate incomplete rather than cheap.
 */
export function costProductLabor(
  laborHours: readonly ProductLaborLineInput[],
  card: ProductLaborRateCard,
): ProductLaborCosting {
  const lines = laborHours.map((line): ProductLaborCostingLine => {
    const rate = card.rates.find((candidate) => candidate.department === line.department);
    const hourlyRate = rate?.costToCompanyRate ?? 0;
    const consumablesPercentage = rate?.consumablesPercentage ?? 0;
    const hours = line.daysPerStaff * card.hoursPerWorkingDay;
    const laborCost = roundCurrency(hours * line.staffCount * hourlyRate);
    const consumablesCost = roundCurrency((laborCost * consumablesPercentage) / 100);

    return {
      ...line,
      consumablesCost,
      consumablesPercentage,
      departmentTotal: roundCurrency(laborCost + consumablesCost),
      hourlyRate,
      hours,
      laborCost,
    };
  });
  const laborCostFloor = roundCurrency(lines.reduce((total, line) => total + line.laborCost, 0));

  return {
    consumablesCostFloor: roundCurrency(lines.reduce((total, line) => total + line.consumablesCost, 0)),
    laborCostFloor,
    lines,
    managementOverheadCostFloor: roundCurrency((laborCostFloor * card.managementOverheadPercentage) / 100),
    managementOverheadPercentage: card.managementOverheadPercentage,
    unratedDepartments: lines.filter((line) => line.hourlyRate === 0).map((line) => line.department),
  };
}

/** The labour grand total: every Department total plus management overhead. */
export function productLaborTotal(costing: {
  consumablesCostFloor: number;
  laborCostFloor: number;
  managementOverheadCostFloor: number;
}): number {
  return roundCurrency(costing.laborCostFloor + costing.consumablesCostFloor + costing.managementOverheadCostFloor);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
