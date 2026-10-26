import { JohnDeereConnectResult } from '@pkg/schema/contracting';
import { z } from 'zod';

export const SettingsTab = z.enum(['general', 'john-deere']);
export type SettingsTab = z.infer<typeof SettingsTab>;

/** `result` is the John Deere callback's outcome, shown once and then dropped from the URL. */
export const SettingsSearch = z.object({
  tab: SettingsTab.default('general').catch('general'),
  result: JohnDeereConnectResult.optional().catch(undefined),
});
export type SettingsSearch = z.infer<typeof SettingsSearch>;
