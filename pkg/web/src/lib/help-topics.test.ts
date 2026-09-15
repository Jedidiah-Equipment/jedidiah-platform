import { describe, expect, it } from 'vitest';

import { createHelpTopicResolver } from './help-topics.js';

const helpTopicForPath = createHelpTopicResolver(
  [
    ['/area', 'inventory'],
    ['/area/nested', 'inventoryCloseOut'],
  ],
  'home',
);

describe('createHelpTopicResolver', () => {
  it('falls back for a screen with no topic of its own', () => {
    expect(helpTopicForPath('/')).toBe('home');
    expect(helpTopicForPath('/elsewhere')).toBe('home');
  });

  it('keeps a detail route on its area topic', () => {
    expect(helpTopicForPath('/area')).toBe('inventory');
    expect(helpTopicForPath('/area/42/edit')).toBe('inventory');
  });

  it('prefers the longer match when one route nests inside another', () => {
    expect(helpTopicForPath('/area/nested')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/area/nested/7')).toBe('inventoryCloseOut');
  });

  it('does not treat a route that merely starts with the same characters as a match', () => {
    expect(helpTopicForPath('/areasomething')).toBe('home');
  });
});
