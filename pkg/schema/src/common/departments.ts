import { z } from 'zod';

export const DEPARTMENTS = ['procurement', 'supply', 'fabrication', 'paint', 'assembly', 'workshop'] as const;

export type Department = z.infer<typeof Department>;
export const Department = z.enum(DEPARTMENTS);

/** Departments with a shared quote/estimate rate card. Operational-only Departments stay out. */
export const WORK_ITEM_DEPARTMENTS = [
  'fabrication',
  'paint',
  'assembly',
  'workshop',
] as const satisfies readonly Department[];

export type WorkItemDepartment = z.infer<typeof WorkItemDepartment>;
export const WorkItemDepartment = z.enum(WORK_ITEM_DEPARTMENTS);
