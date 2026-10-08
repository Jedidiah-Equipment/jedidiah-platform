import { describe, expect, it } from 'vitest';

import { helpTopicForPath } from './help-topics.js';

describe('helpTopicForPath', () => {
  it('resolves each Contracting area, detail routes included', () => {
    expect(helpTopicForPath('/contracting')).toBe('contractingHome');
    expect(helpTopicForPath('/contracting/users')).toBe('contractingUsers');
    expect(helpTopicForPath('/contracting/audit')).toBe('contractingAudit');
    expect(helpTopicForPath('/contracting/transcriptions')).toBe('contractingTranscriptions');
    expect(helpTopicForPath('/contracting/customers/42/edit')).toBe('contractingCustomers');
    expect(helpTopicForPath('/contracting/work-types/42/edit')).toBe('contractingWorkTypes');
    expect(helpTopicForPath('/contracting/rates/42/edit')).toBe('contractingRates');
    expect(helpTopicForPath('/contracting/measure-types')).toBe('contractingMeasureTypes');
    expect(helpTopicForPath('/contracting/readings/exceptions')).toBe('contractingReadings');
    expect(helpTopicForPath('/contracting/jobs/CJOB-00037')).toBe('contractingJobs');
    expect(helpTopicForPath('/contracting/invoicing')).toBe('contractingInvoicing');
    expect(helpTopicForPath('/contracting/fleet/42/edit')).toBe('contractingFleet');
    expect(helpTopicForPath('/contracting/fleet/categories/42/edit')).toBe('contractingCategories');
    expect(helpTopicForPath('/contracting/fleet/implements')).toBe('contractingImplements');
    expect(helpTopicForPath('/contracting/workshop/9bd0c2cb-d97f-4b34-beba-c03e5541c96d')).toBe('contractingWorkshop');
  });
});
