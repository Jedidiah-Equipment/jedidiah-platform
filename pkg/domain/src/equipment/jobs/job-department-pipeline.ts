import type { Department } from '@pkg/schema/equipment';

export type JobDepartmentPipelineStep = {
  sequence: number;
  department: Department;
};

// Display order only. Departments no longer imply persisted per-job stage rows.
export const JOB_DEPARTMENT_PIPELINE = [
  { sequence: 1, department: 'fabrication' },
  { sequence: 2, department: 'procurement' },
  { sequence: 3, department: 'supply' },
  { sequence: 4, department: 'paint' },
  { sequence: 5, department: 'assembly' },
  { sequence: 6, department: 'workshop' },
] as const satisfies readonly JobDepartmentPipelineStep[];
