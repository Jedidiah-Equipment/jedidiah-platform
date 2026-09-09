import { z } from 'zod';

export const DEPARTMENTS = ['fabrication', 'procurement', 'supply', 'paint', 'assembly', 'workshop'] as const;

export type Department = z.infer<typeof Department>;
export const Department = z.enum(DEPARTMENTS);

/**
 * The work Departments: the one list behind Product Labor Hours, Quote Work Items, Department Timing
 * and build metrics. Procurement is operational-only and stays out.
 */
export const WORK_ITEM_DEPARTMENTS = [
  'fabrication',
  'paint',
  'assembly',
  'workshop',
  'supply',
] as const satisfies readonly Department[];

export type WorkItemDepartment = z.infer<typeof WorkItemDepartment>;
export const WorkItemDepartment = z.enum(WORK_ITEM_DEPARTMENTS);
