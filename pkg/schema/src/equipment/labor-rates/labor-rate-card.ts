import { z } from 'zod';
import { WORK_ITEM_DEPARTMENTS, WorkItemDepartment } from '../common/departments.js';

export const LaborHourlyRate = z.number().nonnegative().multipleOf(0.01);
export const LaborOverheadPercentage = z.number().nonnegative();
export const HoursPerWorkingDay = z.number().min(1).max(24);
export const LaborDepartmentRate = z.object({
  department: WorkItemDepartment,
  costToCompanyRate: LaborHourlyRate.nullable(),
  billingRate: LaborHourlyRate.nullable(),
  consumablesPercentage: LaborOverheadPercentage.nullable(),
});
export type LaborDepartmentRate = z.infer<typeof LaborDepartmentRate>;
export const LaborRateCardUpdateInput = z.object({
  hoursPerWorkingDay: HoursPerWorkingDay,
  managementOverheadPercentage: LaborOverheadPercentage,
  rates: z
    .array(LaborDepartmentRate)
    .length(WORK_ITEM_DEPARTMENTS.length)
    .refine(
      (rates) => new Set(rates.map((rate) => rate.department)).size === WORK_ITEM_DEPARTMENTS.length,
      'Include each work Department exactly once.',
    ),
});
export type LaborRateCardUpdateInput = z.infer<typeof LaborRateCardUpdateInput>;
export type LaborRateCard = LaborRateCardUpdateInput;
export type VisibleLaborRateCard = {
  hoursPerWorkingDay: number;
  managementOverheadPercentage?: number;
  rates: Array<{
    department: WorkItemDepartment;
    billingRate: number | null;
    costToCompanyRate?: number | null;
    consumablesPercentage?: number | null;
  }>;
};
