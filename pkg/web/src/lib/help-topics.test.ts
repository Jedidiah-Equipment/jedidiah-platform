import { describe, expect, it } from 'vitest';

import { createHelpTopicResolver } from './help-topics.js';

const helpTopicForPath = createHelpTopicResolver(
  [
    ['/area', 'inventory'],
    ['/area/nested', 'inventoryCloseOut'],
    ['/list', 'inventory'],
    ['/list/$id', 'inventoryCloseOut'],
    ['/list/special', 'home'],
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

  it('lets a $param segment give a detail page its own topic, below a literal route at the same depth', () => {
    expect(helpTopicForPath('/list')).toBe('inventory');
    expect(helpTopicForPath('/list/42')).toBe('inventoryCloseOut');
    expect(helpTopicForPath('/list/special')).toBe('home');
  });

  it('does not treat a route that merely starts with the same characters as a match', () => {
    expect(helpTopicForPath('/areasomething')).toBe('home');
  });
});
