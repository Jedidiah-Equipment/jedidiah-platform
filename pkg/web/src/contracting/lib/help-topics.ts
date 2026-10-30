import type { HelpTopic } from '@pkg/domain';
import { createHelpTopicResolver } from '@/lib/help-topics.js';

const helpTopicForRoute = createHelpTopicResolver(
  [
    ['/contracting/activity', 'contractingActivity'],
    ['/contracting/audit', 'contractingAudit'],
    ['/contracting/customers', 'contractingCustomers'],
    ['/contracting/disputes', 'contractingDisputes'],
    ['/contracting/fleet', 'contractingFleet'],
    ['/contracting/fleet/categories', 'contractingCategories'],
    ['/contracting/fleet/implements', 'contractingImplements'],
    ['/contracting/invoicing', 'contractingInvoicing'],
    ['/contracting/jobs', 'contractingJobs'],
    ['/contracting/reports', 'contractingReports'],
    ['/contracting/settings', 'contractingSettings'],
    ['/contracting/transcriptions', 'contractingTranscriptions'],
    ['/contracting/rates', 'contractingRates'],
    ['/contracting/measure-types', 'contractingMeasureTypes'],
    ['/contracting/users', 'contractingUsers'],
    ['/contracting/work-types', 'contractingWorkTypes'],
    ['/contracting/workshop', 'contractingWorkshop'],
    ['/contracting/services', 'contractingServices'],
    ['/contracting/services/$id', 'contractingServiceRecord'],
  ],
  'contractingHome',
);

/** A Settings tab is a search param, not a route, so the John Deere tab names its own page here. */
export function helpTopicForPath(pathname: string, search: { tab?: unknown } = {}): HelpTopic {
  if (pathname === '/contracting/settings' && search.tab === 'john-deere') return 'contractingJohnDeere';
  return helpTopicForRoute(pathname);
}
