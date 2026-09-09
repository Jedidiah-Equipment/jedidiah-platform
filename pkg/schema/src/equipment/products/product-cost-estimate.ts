import { z } from 'zod';
import { DateIso } from '../../common/date.js';
import { PriceDelta } from '../../common/price.js';
import { UUID } from '../../common/uuid.js';
import { WorkItemDepartment } from '../common/departments.js';
import { declareInventoryCostFields, InventoryCost, InventoryValue } from '../inventory/inventory-cost.js';
import { PartStandardPurchaseLengthMm, PartUnitOfMeasure } from '../parts/part.js';
import { AssemblyKind } from './product.js';

export type ProductCostEstimateMissingPart = z.infer<typeof ProductCostEstimateMissingPart>;
export const ProductCostEstimateMissingPart = z.object({
  partCode: z.string().trim().min(1),
  partId: UUID,
  partName: z.string().trim().min(1),
});

export type ProductCostEstimatePartLine = z.infer<typeof ProductCostEstimatePartLine>;
export const ProductCostEstimatePartLine = z.object({
  costFloor: z.number().finite().nonnegative(),
  isInternallyFabricated: z.boolean(),
  partCode: z.string().trim().min(1),
  partId: UUID,
  partName: z.string().trim().min(1),
  quantity: z.number().positive(),
  // What `unitCost` is per: a linear Part's average is per millimetre, so it is scaled to one whole
  // standard-length piece here. Job snapshots stamped before the field read it as null.
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable().default(null),
  unitCost: InventoryCost,
  unitOfMeasure: PartUnitOfMeasure,
});

export const ProductCostEstimatePartLineCostFields = declareInventoryCostFields(
  ProductCostEstimatePartLine,
  'unitCost',
);

export type ProductCostEstimateAssembly = z.infer<typeof ProductCostEstimateAssembly>;
export const ProductCostEstimateAssembly = z.object({
  assemblyId: UUID,
  assemblyName: z.string().trim().min(1),
  complete: z.boolean(),
  costFloor: z.number().finite().nonnegative(),
  kind: AssemblyKind,
  partial: z.boolean(),
  parts: z.array(ProductCostEstimatePartLine),
  uncostedPartCount: z.number().int().nonnegative(),
  upgradePrice: PriceDelta.nullable(),
});

export type ProductCostEstimateMaterialLine = z.infer<typeof ProductCostEstimateMaterialLine>;
export const ProductCostEstimateMaterialLine = z.object({
  costFloor: z.number().finite().nonnegative(),
  partCode: z.string().trim().min(1),
  partId: UUID,
  partName: z.string().trim().min(1),
  quantityPerUnit: z.number().positive(),
  standardPurchaseLengthMm: PartStandardPurchaseLengthMm.nullable().default(null),
  unitCost: InventoryCost,
  unitOfMeasure: PartUnitOfMeasure,
});

export const ProductCostEstimateMaterialLineCostFields = declareInventoryCostFields(
  ProductCostEstimateMaterialLine,
  'unitCost',
);

const LEGACY_HOURS_PER_WORKING_DAY = 9;

/**
 * Job snapshots stamped before the Labor Rate Card froze a labour line as hours at a rate. They read
 * the way the migration backfilled live rows: one staff member at nine hours a day, no consumables and
 * no management overhead, so their frozen totals stand unchanged.
 */
function upgradeLegacyLaborLine(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || 'daysPerStaff' in value) return value;
  const { cost, hours, ...rest } = value as { cost?: unknown; hours?: unknown };
  if (typeof cost !== 'number' || typeof hours !== 'number') return value;

  return {
    ...rest,
    consumablesCost: 0,
    consumablesPercentage: 0,
    daysPerStaff: Math.max(0.01, Math.round((hours / LEGACY_HOURS_PER_WORKING_DAY) * 100) / 100),
    departmentTotal: cost,
    hours,
    laborCost: cost,
    staffCount: 1,
  };
}

export type ProductCostEstimateLaborLine = z.infer<typeof ProductCostEstimateLaborLine>;
export const ProductCostEstimateLaborLine = z.preprocess(
  upgradeLegacyLaborLine,
  z.object({
    consumablesCost: z.number().finite().nonnegative(),
    consumablesPercentage: z.number().finite().nonnegative(),
    daysPerStaff: z.number().positive(),
    department: WorkItemDepartment,
    departmentTotal: z.number().finite().nonnegative(),
    hourlyRate: z.number().finite().nonnegative(),
    hours: z.number().positive(),
    laborCost: z.number().finite().nonnegative(),
    staffCount: z.number().int().positive(),
  }),
);

export type ProductCostEstimate = z.infer<typeof ProductCostEstimate>;
export const ProductCostEstimate = z.object({
  assemblies: z.array(ProductCostEstimateAssembly),
  basePrice: z.number().finite().nonnegative(),
  complete: z.boolean(),
  // Overhead floors default to zero so Job snapshots stamped before the Labor Rate Card still read.
  consumablesCostFloor: z.number().finite().nonnegative().default(0),
  currencyCode: z.literal('ZAR'),
  estimatedMarginCeiling: z.number().finite(),
  laborCostFloor: z.number().finite().nonnegative(),
  laborHours: z.array(ProductCostEstimateLaborLine),
  managementOverheadCostFloor: z.number().finite().nonnegative().default(0),
  managementOverheadPercentage: z.number().finite().nonnegative().default(0),
  materialCostFloor: z.number().finite().nonnegative(),
  materialLines: z.array(ProductCostEstimateMaterialLine),
  missing: z.object({
    laborHours: z.boolean(),
    materialList: z.boolean(),
    unattributedProductTerms: z.boolean(),
    uncostedParts: z.array(ProductCostEstimateMissingPart),
    unratedDepartments: z.array(WorkItemDepartment),
  }),
  optionalAssemblies: z.array(ProductCostEstimateAssembly),
  partsCostFloor: z.number().finite().nonnegative(),
  productId: UUID,
  scope: z.enum(['build', 'rework']),
  totalCostFloor: z.number().finite().nonnegative(),
});

export type JobEstimateSnapshot = z.infer<typeof JobEstimateSnapshot>;
export const JobEstimateSnapshot = z.object({
  createdAt: DateIso,
  estimate: ProductCostEstimate,
});

export type JobCostComparison = z.infer<typeof JobCostComparison>;
export const JobCostComparison = z.object({
  actualCost: InventoryValue,
  estimatedPartsCostFloor: z.number().finite().nonnegative().nullable(),
  partsCostVariance: PriceDelta.nullable(),
  snapshot: JobEstimateSnapshot.nullable(),
});

export const JobCostComparisonCostFields = declareInventoryCostFields(JobCostComparison, 'actualCost');
