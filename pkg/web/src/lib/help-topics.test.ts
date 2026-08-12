import { HELP_TOPICS } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { helpTopicForPath } from './help-topics.js';

describe('helpTopicForPath', () => {
  it('lands on the docs home for a screen with no topic of its own', () => {
    expect(helpTopicForPath('/dashboard')).toBe('home');
    expect(helpTopicForPath('/')).toBe('home');
  });

  it('resolves an area from its route', () => {
    expect(helpTopicForPath('/bays')).toBe('bays');
    expect(helpTopicForPath('/inventory')).toBe('inventory');
    expect(helpTopicForPath('/parts')).toBe('parts');
    expect(helpTopicForPath('/purchase-orders')).toBe('purchaseOrders');
    expect(helpTopicForPath('/suppliers')).toBe('suppliers');
  });

  it('keeps a detail route on its area topic', () => {
    expect(helpTopicForPath('/inventory/9f1c-part-id')).toBe('inventory');
    expect(helpTopicForPath('/quotes/42/edit')).toBe('quotes');
  });

  it('prefers the longer match when one route nests inside another', () => {
    expect(helpTopicForPath('/inventory/close-out')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/inventory/close-out/job-7')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/inventory/price-variance')).toBe('inventoryPriceVariance');
    expect(helpTopicForPath('/jobs/activity')).toBe('jobActivity');
  });

  it('keeps the other Job screens on the Jobs topic', () => {
    expect(helpTopicForPath('/jobs')).toBe('jobs');
    expect(helpTopicForPath('/jobs/list')).toBe('jobs');
    expect(helpTopicForPath('/jobs/calendar')).toBe('jobs');
  });

  it('does not treat a route that merely starts with the same characters as a match', () => {
    expect(helpTopicForPath('/partsomething')).toBe('home');
  });

  it('resolves to a topic the registry declares', () => {
    for (const path of ['/inventory', '/inventory/close-out', '/parts', '/jobs', '/units', '/anything-else']) {
      expect(HELP_TOPICS).toHaveProperty(helpTopicForPath(path));
    }
  });
});
