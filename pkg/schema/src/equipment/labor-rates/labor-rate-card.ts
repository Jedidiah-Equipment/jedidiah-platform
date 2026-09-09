import { z } from 'zod';
import { WORK_ITEM_DEPARTMENTS, WorkItemDepartment } from '../common/departments.js';
import { declareInventoryCostFields, inventoryCostLeaves } from '../inventory/inventory-cost.js';

export const LaborHourlyRate = z.number().nonnegative().multipleOf(0.01);
export const LaborOverheadPercentage = z.number().nonnegative();
export const HoursPerWorkingDay = z.number().min(1).max(24);

/** Null means the card leaves it blank or the caller cannot read inventory costs. */
export const LaborCostToCompanyRate = LaborHourlyRate.nullable();
inventoryCostLeaves.add(LaborCostToCompanyRate, { gated: true });
export const LaborConsumablesPercentage = LaborOverheadPercentage.nullable();
inventoryCostLeaves.add(LaborConsumablesPercentage, { gated: true });
/** Always set on the card; null only when the cost gate hides it. */
export const LaborManagementOverheadPercentage = z.number().nonnegative();
inventoryCostLeaves.add(LaborManagementOverheadPercentage, { gated: true });

export type LaborDepartmentRate = z.infer<typeof LaborDepartmentRate>;
export const LaborDepartmentRate = z.object({
  department: WorkItemDepartment,
  costToCompanyRate: LaborCostToCompanyRate,
  billingRate: LaborHourlyRate.nullable(),
  consumablesPercentage: LaborConsumablesPercentage,
});
export const LaborDepartmentRateCostFields = declareInventoryCostFields(
  LaborDepartmentRate,
  'costToCompanyRate',
  'consumablesPercentage',
);

export type LaborRateCard = z.infer<typeof LaborRateCard>;
export const LaborRateCard = z.object({
  hoursPerWorkingDay: HoursPerWorkingDay,
  managementOverheadPercentage: LaborManagementOverheadPercentage,
  rates: z
    .array(LaborDepartmentRate)
    .length(WORK_ITEM_DEPARTMENTS.length)
    .refine(
      (rates) => new Set(rates.map((rate) => rate.department)).size === WORK_ITEM_DEPARTMENTS.length,
      'Include each work Department exactly once.',
    ),
});
export const LaborRateCardCostFields = declareInventoryCostFields(LaborRateCard, 'managementOverheadPercentage');
export type LaborRateCardUpdateInput = LaborRateCard;
export const LaborRateCardUpdateInput = LaborRateCard;

/** The card as a caller reads it past the cost gate: management overhead is null when hidden. */
export type LaborRateCardView = Omit<LaborRateCard, 'managementOverheadPercentage'> & {
  managementOverheadPercentage: number | null;
};

/** What a Quote editor needs to seed a Work Item; readable by any signed-in user. */
export type LaborBillingRates = z.infer<typeof LaborBillingRates>;
export const LaborBillingRates = z.object({
  hoursPerWorkingDay: HoursPerWorkingDay,
  rates: z.array(z.object({ department: WorkItemDepartment, billingRate: LaborHourlyRate.nullable() })),
});
