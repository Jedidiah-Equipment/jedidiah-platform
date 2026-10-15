import { z } from 'zod';

export const MachineEditTab = z.enum(['details', 'service']);
export type MachineEditTab = z.infer<typeof MachineEditTab>;

export const MachineEditSearch = z.object({
  tab: MachineEditTab.default('details').catch('details'),
});

export function resolveMachineEditTab(tab: MachineEditTab, canReadServices: boolean): MachineEditTab {
  return tab === 'service' && !canReadServices ? 'details' : tab;
}
