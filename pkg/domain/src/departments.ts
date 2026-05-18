import type { Department } from '@pkg/schema';

export const departmentLabels: Record<Department, string> = {
  procurement: 'Procurement',
  fabrication: 'Fabrication',
  paint: 'Paint',
  assembly: 'Assembly',
  dispatch: 'Dispatch',
};

export const departmentShortLabels: Record<Department, string> = {
  procurement: 'Proc',
  fabrication: 'Fab',
  paint: 'Paint',
  assembly: 'Asm',
  dispatch: 'Dispatch',
};
