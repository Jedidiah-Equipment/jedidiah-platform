import { createHelpTopicResolver } from '@/lib/help-topics.js';

export const helpTopicForPath = createHelpTopicResolver(
  [
    ['/contracting/audit', 'contractingAudit'],
    ['/contracting/customers', 'contractingCustomers'],
    ['/contracting/fleet', 'contractingFleet'],
    ['/contracting/fleet/categories', 'contractingCategories'],
    ['/contracting/fleet/implements', 'contractingImplements'],
    ['/contracting/readings', 'contractingReadings'],
    ['/contracting/users', 'contractingUsers'],
    ['/contracting/work-types', 'contractingWorkTypes'],
  ],
  'contractingHome',
);
