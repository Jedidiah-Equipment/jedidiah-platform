import { JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import type { Bay } from '@pkg/schema';

const jobDepartmentOrder = new Map(JOB_DEPARTMENT_PIPELINE.map((step, index) => [step.department, index]));

export function sortBaysByDepartmentPipeline(bays: Bay[]): Bay[] {
  return [...bays].sort((left, right) => {
    const departmentSort =
      (jobDepartmentOrder.get(left.department) ?? Number.MAX_SAFE_INTEGER) -
      (jobDepartmentOrder.get(right.department) ?? Number.MAX_SAFE_INTEGER);

    if (departmentSort !== 0) {
      return departmentSort;
    }

    return left.name.localeCompare(right.name);
  });
}
