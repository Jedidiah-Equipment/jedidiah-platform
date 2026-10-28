import { z } from 'zod';

export const MachineEditTab = z.enum(['details', 'jobs', 'workshop', 'service']);
export type MachineEditTab = z.infer<typeof MachineEditTab>;

export const MachineEditSearch = z.object({
  tab: MachineEditTab.default('details').catch('details'),
});

/** Whether the reader may open each tab beyond Details. */
export type MachineTabAccess = Record<Exclude<MachineEditTab, 'details'>, boolean>;

export function resolveMachineEditTab(tab: MachineEditTab, access: MachineTabAccess): MachineEditTab {
  return tab !== 'details' && !access[tab] ? 'details' : tab;
}
