import { z } from 'zod';

export const CustomerEditTab = z.enum(['details', 'jobs']);
export type CustomerEditTab = z.infer<typeof CustomerEditTab>;

export const CustomerEditSearch = z.object({
  tab: CustomerEditTab.default('details').catch('details'),
});
