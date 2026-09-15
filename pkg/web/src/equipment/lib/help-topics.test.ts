import { HELP_TOPICS } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { helpTopicForPath } from './help-topics.js';

describe('helpTopicForPath', () => {
  it('lands on the docs home for a screen with no topic of its own', () => {
    expect(helpTopicForPath('/equipment/dashboard')).toBe('home');
  });

  it('resolves an area from its route', () => {
    expect(helpTopicForPath('/equipment/labor-rates')).toBe('laborRates');
    expect(helpTopicForPath('/equipment/bays')).toBe('bays');
    expect(helpTopicForPath('/equipment/customers/42/edit')).toBe('customers');
    expect(helpTopicForPath('/equipment/inventory/9f1c-part-id')).toBe('inventory');
    expect(helpTopicForPath('/equipment/parts')).toBe('parts');
    expect(helpTopicForPath('/equipment/purchase-orders')).toBe('purchaseOrders');
    expect(helpTopicForPath('/equipment/quotes/42/edit')).toBe('quotes');
    expect(helpTopicForPath('/equipment/suppliers')).toBe('suppliers');
  });

  it('gives nested areas their own topic', () => {
    expect(helpTopicForPath('/equipment/inventory/close-out/job-7')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/equipment/inventory/price-variance')).toBe('inventoryPriceVariance');
    expect(helpTopicForPath('/equipment/jobs/activity')).toBe('jobActivity');
    expect(helpTopicForPath('/equipment/jobs/calendar')).toBe('jobs');
  });

  it('resolves to a topic the registry declares', () => {
    for (const path of ['/equipment/inventory', '/equipment/parts', '/equipment/jobs', '/equipment/units', '/x']) {
      expect(HELP_TOPICS).toHaveProperty(helpTopicForPath(path));
    }
  });
});
