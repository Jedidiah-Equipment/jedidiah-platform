import type { Department } from '@pkg/schema';

export const departmentLabels: Record<Department, string> = {
  procurement: 'Procurement',
  supply: 'Supply',
  fabrication: 'Fabrication',
  paint: 'Paint',
  assembly: 'Assembly',
};

export const departmentShortLabels: Record<Department, string> = {
  procurement: 'Proc',
  supply: 'Supply',
  fabrication: 'Fab',
  paint: 'Paint',
  assembly: 'Asm',
};

/**
 * What the shop calls each Department when quoting, which is not always what it calls it internally —
 * Assembly is "Workshop" on a quote. Quote surfaces and the customer document read these; the job
 * board, bay filters, user departments, and Job sheets stay on {@link departmentLabels} so the floor
 * sees the department that actually owns the bay and the people.
 */
export const quoteDepartmentLabels: Record<Department, string> = {
  procurement: 'Procurement',
  supply: 'Supply',
  fabrication: 'Fabrication',
  paint: 'Paintshop',
  assembly: 'Workshop',
};
