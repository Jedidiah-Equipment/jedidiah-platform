import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { showTabBar, visibleTabs } from './app-tabs';

describe('visibleTabs', () => {
  it('shows no tabs while access is unresolved', () => {
    expect(visibleTabs(undefined)).toEqual([]);
    expect(visibleTabs(null)).toEqual([]);
  });

  it('shows Schedule and Units to a Job Viewer', () => {
    const access = createUserAccessSummary({ role: 'job-viewer', userId: 'viewer-1' });

    expect(visibleTabs(access)).toEqual(['schedule', 'units']);
  });

  it('shows Quotes and Units to Sales', () => {
    const access = createUserAccessSummary({ role: 'sales', userId: 'sales-1' });

    expect(visibleTabs(access)).toEqual(['quotes', 'units']);
  });

  it('shows Schedule, Products, and Units to a Procurement Manager', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'buyer-1' });

    expect(visibleTabs(access)).toEqual(['schedule', 'products', 'units']);
  });

  it('shows every tab to an Admin', () => {
    const access = createUserAccessSummary({ role: 'admin', userId: 'admin-1' });

    expect(visibleTabs(access)).toEqual(['schedule', 'quotes', 'products', 'units']);
  });
});

describe('showTabBar', () => {
  it('stays collapsed when no tabs are visible', () => {
    expect(showTabBar([])).toBe(false);
  });

  it('collapses when Schedule is the only visible tab', () => {
    expect(showTabBar(['schedule'])).toBe(false);
  });

  it('renders once Units joins a single other tab', () => {
    // Every role reads Units, so the roles that used to see one tab now get a bar.
    expect(showTabBar(['schedule', 'units'])).toBe(true);
  });

  it('renders when Products is also visible', () => {
    expect(showTabBar(['schedule', 'products'])).toBe(true);
  });
});
