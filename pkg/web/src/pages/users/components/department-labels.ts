import type { Department } from '@pkg/schema';

export const departmentLabels: Record<Department, string> = {
  assembly: 'Assembly',
  dispatch: 'Dispatch',
  fabrication: 'Fabrication',
  paint: 'Paint',
  procurement: 'Procurement',
};
