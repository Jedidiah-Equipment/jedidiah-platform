import { describe, expect, it } from 'vitest';

import type { AppTab } from './app-tabs';
import { fitAppTabs } from './tab-bar-fit';

const ALL_TABS: AppTab[] = ['activity', 'jobs', 'plan', 'quotes', 'products', 'units', 'stores'];

describe('fitAppTabs', () => {
  it('keeps every tab on a tablet-width bar', () => {
    expect(fitAppTabs(ALL_TABS, 768)).toEqual({ visible: ALL_TABS, overflow: [] });
  });

  it('keeps every tab before layout has reported a width', () => {
    expect(fitAppTabs(ALL_TABS, 0)).toEqual({ visible: ALL_TABS, overflow: [] });
  });

  /** The first four destinations remain direct on a phone; the trailing destinations move. */
  it('collapses the trailing tabs that would truncate on a phone-width bar', () => {
    expect(fitAppTabs(ALL_TABS, 390)).toEqual({
      visible: ['activity', 'jobs', 'plan', 'quotes'],
      overflow: ['products', 'units', 'stores'],
    });
  });

  it('collapses further as the bar narrows', () => {
    const narrow = fitAppTabs(ALL_TABS, 260);

    expect(narrow.visible.length).toBeLessThan(4);
    expect([...narrow.visible, ...narrow.overflow]).toEqual(ALL_TABS);
  });

  it('keeps one tab beside the menu when nothing else fits', () => {
    expect(fitAppTabs(ALL_TABS, 80)).toEqual({
      visible: ['activity'],
      overflow: ['jobs', 'plan', 'quotes', 'products', 'units', 'stores'],
    });
  });

  it('leaves a short tab set alone at the same width', () => {
    expect(fitAppTabs(['activity', 'jobs', 'plan', 'units'], 390)).toEqual({
      visible: ['activity', 'jobs', 'plan', 'units'],
      overflow: [],
    });
  });
});
