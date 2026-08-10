import { z } from 'zod';
import { DateIso } from '../common/date.js';
import { WorkItemDepartment } from '../common/departments.js';
import { PriceDelta } from '../common/price.js';
import { UUID } from '../common/uuid.js';
import { declareInventoryCostFields, InventoryCost, InventoryValue } from '../inventory/inventory-cost.js';
import { PartUnitOfMeasure } from '../parts/part.js';
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
  unitCost: InventoryCost,
  unitOfMeasure: PartUnitOfMeasure,
});

export const ProductCostEstimateMaterialLineCostFields = declareInventoryCostFields(
  ProductCostEstimateMaterialLine,
  'unitCost',
);

export type ProductCostEstimateLaborLine = z.infer<typeof ProductCostEstimateLaborLine>;
export const ProductCostEstimateLaborLine = z.object({
  cost: z.number().finite().nonnegative(),
  department: WorkItemDepartment,
  hours: z.number().positive(),
  hourlyRate: z.number().finite().nonnegative(),
});

export type ProductCostEstimate = z.infer<typeof ProductCostEstimate>;
export const ProductCostEstimate = z.object({
  assemblies: z.array(ProductCostEstimateAssembly),
  basePrice: z.number().finite().nonnegative(),
  complete: z.boolean(),
  currencyCode: z.literal('ZAR'),
  estimatedMarginFloor: z.number().finite(),
  laborCostFloor: z.number().finite().nonnegative(),
  laborHours: z.array(ProductCostEstimateLaborLine),
  materialCostFloor: z.number().finite().nonnegative(),
  materialLines: z.array(ProductCostEstimateMaterialLine),
  missing: z.object({
    laborHours: z.boolean(),
    materialList: z.boolean(),
    uncostedParts: z.array(ProductCostEstimateMissingPart),
  }),
  optionalAssemblies: z.array(ProductCostEstimateAssembly),
  partsCostFloor: z.number().finite().nonnegative(),
  productId: UUID,
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
  estimatedCostFloor: z.number().finite().nonnegative().nullable(),
  estimateVariance: PriceDelta.nullable(),
  snapshot: JobEstimateSnapshot.nullable(),
});

export const JobCostComparisonCostFields = declareInventoryCostFields(JobCostComparison, 'actualCost');
