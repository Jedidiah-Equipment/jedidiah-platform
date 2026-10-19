import { z } from 'zod';

export const MachineEditTab = z.enum(['details', 'service', 'jobs']);
export type MachineEditTab = z.infer<typeof MachineEditTab>;

export const MachineEditSearch = z.object({
  tab: MachineEditTab.default('details').catch('details'),
});

export function resolveMachineEditTab(
  tab: MachineEditTab,
  { readsServices, readsJobs }: { readsServices: boolean; readsJobs: boolean },
): MachineEditTab {
  if (tab === 'service' && !readsServices) return 'details';
  if (tab === 'jobs' && !readsJobs) return 'details';
  return tab;
}
