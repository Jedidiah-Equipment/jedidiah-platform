import type { Department, LaborBillingRates, LaborRateCard, WorkItemDepartment } from '@pkg/schema/equipment';
import { WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { quoteDepartmentLabels } from '../departments.js';

export { WORK_ITEM_DEPARTMENTS, type WorkItemDepartment } from '@pkg/schema/equipment';

export function isWorkItemDepartment(department: Department): department is WorkItemDepartment {
  return (WORK_ITEM_DEPARTMENTS as readonly Department[]).includes(department);
}

/** The billing side of the Labor Rate Card, which any signed-in user reads to seed a Work Item. */
export function laborBillingRates(card: LaborRateCard): LaborBillingRates {
  return {
    hoursPerWorkingDay: card.hoursPerWorkingDay,
    rates: card.rates.map(({ department, billingRate }) => ({ department, billingRate })),
  };
}

/**
 * The rate a Work Item seeds with when a Department is picked. Anything the card does not rate seeds
 * at zero: a blank billing rate, or a non-work Department such as the editors' "Other".
 */
export function workItemDepartmentRate(department: string, billing: LaborBillingRates): number {
  return billing.rates.find((rate) => rate.department === department)?.billingRate ?? 0;
}

/**
 * A Work Item's quote-facing label: a departmental item is named by its Department, and only the
 * department-less "Other" item carries a stored name. The `quote_work_items_name_shape` constraint
 * makes that pairing an invariant, so the fallback here is unreachable for persisted rows and exists
 * for in-flight form values only.
 */
export function quoteWorkItemName(workItem: { department: Department | null; name: string | null }): string {
  return workItem.department ? quoteDepartmentLabels[workItem.department] : (workItem.name ?? '');
}
