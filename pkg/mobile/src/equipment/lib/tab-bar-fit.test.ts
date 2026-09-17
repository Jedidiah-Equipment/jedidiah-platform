import { describe, expect, it } from 'vitest';

import { fitAppTabs } from '@/components/tab-bar/tab-bar-fit';

const names = ['activity', 'jobs', 'plan', 'quotes', 'products', 'units', 'stores'] as const;
const ALL_TABS = names.map((key) => ({ key, label: key.toUpperCase() }));

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
      visible: ALL_TABS.slice(0, 4),
      overflow: ALL_TABS.slice(4),
    });
  });

  it('collapses further as the bar narrows', () => {
    const narrow = fitAppTabs(ALL_TABS, 260);

    expect(narrow.visible.length).toBeLessThan(4);
    expect([...narrow.visible, ...narrow.overflow]).toEqual(ALL_TABS);
  });

  it('keeps one tab beside the menu when nothing else fits', () => {
    expect(fitAppTabs(ALL_TABS, 80)).toEqual({
      visible: ALL_TABS.slice(0, 1),
      overflow: ALL_TABS.slice(1),
    });
  });

  it('leaves a short tab set alone at the same width', () => {
    const shortTabs = ALL_TABS.slice(0, 4);
    expect(fitAppTabs(shortTabs, 390)).toEqual({
      visible: shortTabs,
      overflow: [],
    });
  });
});
