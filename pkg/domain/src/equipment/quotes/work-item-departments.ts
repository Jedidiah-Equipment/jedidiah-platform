import type { Department, WorkItemDepartment } from '@pkg/schema/equipment';
import { WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { quoteDepartmentLabels } from '../departments.js';

export { WORK_ITEM_DEPARTMENTS, type WorkItemDepartment } from '@pkg/schema/equipment';

export function isWorkItemDepartment(department: Department): department is WorkItemDepartment {
  return (WORK_ITEM_DEPARTMENTS as readonly Department[]).includes(department);
}

/** The rate a Work Item seeds with when its Department is picked. Unrated Departments seed at zero. */
export function workItemDepartmentRate(
  department: Department,
  rates: readonly { department: WorkItemDepartment; billingRate: number | null }[],
): number {
  return rates.find((rate) => rate.department === department)?.billingRate ?? 0;
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
