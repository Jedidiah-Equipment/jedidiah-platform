import { createHelpTopicResolver } from '@/lib/help-topics.js';

export const helpTopicForPath = createHelpTopicResolver(
  [
    ['/contracting/audit', 'contractingAudit'],
    ['/contracting/customers', 'contractingCustomers'],
    ['/contracting/fleet', 'contractingFleet'],
    ['/contracting/fleet/categories', 'contractingCategories'],
    ['/contracting/fleet/implements', 'contractingImplements'],
    ['/contracting/invoicing', 'contractingInvoicing'],
    ['/contracting/jobs', 'contractingJobs'],
    ['/contracting/readings', 'contractingReadings'],
    ['/contracting/rates', 'contractingRates'],
    ['/contracting/measure-types', 'contractingMeasureTypes'],
    ['/contracting/users', 'contractingUsers'],
    ['/contracting/work-types', 'contractingWorkTypes'],
  ],
  'contractingHome',
);
