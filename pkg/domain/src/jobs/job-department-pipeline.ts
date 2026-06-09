import type { Department } from '@pkg/schema';

export type JobDepartmentPipelineStep = {
  sequence: number;
  department: Department;
};

// Display order only. Departments no longer imply persisted per-job stage rows.
export const JOB_DEPARTMENT_PIPELINE = [
  { sequence: 1, department: 'procurement' },
  { sequence: 2, department: 'supply' },
  { sequence: 3, department: 'fabrication' },
  { sequence: 4, department: 'paint' },
  { sequence: 5, department: 'assembly' },
] as const satisfies readonly JobDepartmentPipelineStep[];
