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
