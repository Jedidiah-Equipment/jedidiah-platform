import type { Department, WorkItemDepartment } from '@pkg/schema/equipment';
import { WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { quoteDepartmentLabels } from '../departments.js';

/**
 * Default ex-VAT hourly rate for the rated Work Item Departments. Membership lives in
 * `WORK_ITEM_DEPARTMENTS`; this map owns only the rates, and a work Department it leaves out is
 * unrated. These rates seed a Work Item, so editing one never reprices an existing Quote.
 */
export const WORK_ITEM_DEPARTMENT_RATES: Partial<Record<WorkItemDepartment, number>> = {
  fabrication: 550,
  paint: 375,
  assembly: 320,
  workshop: 320,
};

export { WORK_ITEM_DEPARTMENTS, type WorkItemDepartment } from '@pkg/schema/equipment';

export function isWorkItemDepartment(department: Department): department is WorkItemDepartment {
  return (WORK_ITEM_DEPARTMENTS as readonly Department[]).includes(department);
}

/** The rate a Work Item seeds with when its Department is picked. Unrated Departments seed at zero. */
export function workItemDepartmentRate(department: Department): number {
  return isWorkItemDepartment(department) ? (WORK_ITEM_DEPARTMENT_RATES[department] ?? 0) : 0;
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
