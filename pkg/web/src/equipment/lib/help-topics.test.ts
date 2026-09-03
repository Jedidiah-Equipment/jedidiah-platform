import { HELP_TOPICS } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { helpTopicForPath } from './help-topics.js';

describe('helpTopicForPath', () => {
  it('lands on the docs home for a screen with no topic of its own', () => {
    expect(helpTopicForPath('/equipment/dashboard')).toBe('home');
    expect(helpTopicForPath('/')).toBe('home');
  });

  it('resolves an area from its route', () => {
    expect(helpTopicForPath('/equipment/bays')).toBe('bays');
    expect(helpTopicForPath('/equipment/customers')).toBe('customers');
    expect(helpTopicForPath('/equipment/inventory')).toBe('inventory');
    expect(helpTopicForPath('/equipment/parts')).toBe('parts');
    expect(helpTopicForPath('/equipment/purchase-orders')).toBe('purchaseOrders');
    expect(helpTopicForPath('/equipment/suppliers')).toBe('suppliers');
  });

  it('keeps a detail route on its area topic', () => {
    expect(helpTopicForPath('/equipment/inventory/9f1c-part-id')).toBe('inventory');
    expect(helpTopicForPath('/equipment/customers/42/edit')).toBe('customers');
    expect(helpTopicForPath('/equipment/quotes/42/edit')).toBe('quotes');
  });

  it('prefers the longer match when one route nests inside another', () => {
    expect(helpTopicForPath('/equipment/inventory/close-out')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/equipment/inventory/close-out/job-7')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/equipment/inventory/price-variance')).toBe('inventoryPriceVariance');
    expect(helpTopicForPath('/equipment/jobs/activity')).toBe('jobActivity');
  });

  it('keeps the other Job screens on the Jobs topic', () => {
    expect(helpTopicForPath('/equipment/jobs')).toBe('jobs');
    expect(helpTopicForPath('/equipment/jobs/list')).toBe('jobs');
    expect(helpTopicForPath('/equipment/jobs/calendar')).toBe('jobs');
  });

  it('does not treat a route that merely starts with the same characters as a match', () => {
    expect(helpTopicForPath('/partsomething')).toBe('home');
  });

  it('resolves to a topic the registry declares', () => {
    for (const path of [
      '/equipment/inventory',
      '/equipment/inventory/close-out',
      '/equipment/parts',
      '/equipment/jobs',
      '/equipment/units',
      '/anything-else',
    ]) {
      expect(HELP_TOPICS).toHaveProperty(helpTopicForPath(path));
    }
  });
});
