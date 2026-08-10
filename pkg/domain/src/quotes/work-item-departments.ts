import type { Department } from '@pkg/schema';

import { quoteDepartmentLabels } from '../departments.js';

/**
 * Default ex-VAT hourly rate per Department. A Department becomes quotable by gaining a rate here —
 * the `quote_work_items_department_value_check` constraint already permits the full enum, so no
 * migration is involved. These rates only *seed* a Work Item: each row snapshots the amount it was
 * priced at, so editing this map never reprices an existing Quote.
 */
export const WORK_ITEM_DEPARTMENT_RATES = {
  fabrication: 550,
  paint: 375,
  assembly: 320,
  workshop: 320,
} as const satisfies Partial<Record<Department, number>>;

export type WorkItemDepartment = keyof typeof WORK_ITEM_DEPARTMENT_RATES;

/** The Departments offered in the Work Item picker, in the order the shop quotes them. */
export const WORK_ITEM_DEPARTMENTS = Object.keys(WORK_ITEM_DEPARTMENT_RATES) as WorkItemDepartment[];

export function isWorkItemDepartment(department: Department): department is WorkItemDepartment {
  return department in WORK_ITEM_DEPARTMENT_RATES;
}

/** The rate a Work Item seeds with when its Department is picked. Unrated Departments seed at zero. */
export function workItemDepartmentRate(department: Department): number {
  return isWorkItemDepartment(department) ? WORK_ITEM_DEPARTMENT_RATES[department] : 0;
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
