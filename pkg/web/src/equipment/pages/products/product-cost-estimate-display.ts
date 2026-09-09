import { formatCurrency } from '@pkg/domain';
import { departmentLabels } from '@pkg/domain/equipment';
import type { ProductCostEstimate } from '@pkg/schema/equipment';

export function estimateTermCompleteness(estimate: {
  assemblies: ReadonlyArray<{ complete: boolean }>;
  materialLines: ReadonlyArray<{ unitCost: number | null }>;
  missing: ProductCostEstimate['missing'];
}): { labor: boolean; material: boolean; parts: boolean } {
  return {
    labor:
      !estimate.missing.laborHours &&
      !estimate.missing.unattributedProductTerms &&
      estimate.missing.unratedDepartments.length === 0,
    material:
      !estimate.missing.materialList &&
      !estimate.missing.unattributedProductTerms &&
      estimate.materialLines.every((line) => line.unitCost !== null),
    parts: estimate.assemblies.every((assembly) => assembly.complete),
  };
}

export function missingEstimateLabels(missing: ProductCostEstimate['missing']): string[] {
  return [
    ...(missing.materialList ? ['material list'] : []),
    ...(missing.laborHours ? ['labor'] : []),
    ...missing.unratedDepartments.map((department) => `${departmentLabels[department]} labor rate`),
    ...(missing.unattributedProductTerms ? ['rework material and labor attribution'] : []),
    ...(missing.uncostedParts.length > 0
      ? [`${missing.uncostedParts.length} uncosted ${missing.uncostedParts.length === 1 ? 'part' : 'parts'}`]
      : []),
  ];
}

export function formatEstimateFloor(value: number, complete: boolean): string {
  return `${complete ? '' : '≥ '}${formatCurrency(value, 'ZAR')}`;
}

export function formatEstimateCeiling(value: number, complete: boolean): string {
  return `${complete ? '' : '≤ '}${formatCurrency(value, 'ZAR')}`;
}
