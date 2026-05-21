import type { JobStageName } from '@pkg/schema';

export const stageLabels = {
  procurement: 'Procurement',
  fabrication: 'Fabrication',
  paint: 'Paint',
  assembly: 'Assembly',
  supply: 'Supply',
} as const satisfies Record<JobStageName, string>;
