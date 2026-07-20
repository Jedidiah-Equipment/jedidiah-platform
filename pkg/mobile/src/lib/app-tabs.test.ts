import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { showTabBar, visibleTabs } from './app-tabs';

describe('visibleTabs', () => {
  it('shows no tabs while access is unresolved', () => {
    expect(visibleTabs(undefined)).toEqual([]);
    expect(visibleTabs(null)).toEqual([]);
  });

  it('shows only Schedule to a Job Viewer', () => {
    const access = createUserAccessSummary({ role: 'job-viewer', userId: 'viewer-1' });

    expect(visibleTabs(access)).toEqual(['schedule']);
  });

  it('shows only Quotes to Sales', () => {
    const access = createUserAccessSummary({ role: 'sales', userId: 'sales-1' });

    expect(visibleTabs(access)).toEqual(['quotes']);
  });

  it('shows Schedule and Products to a Procurement Manager', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'buyer-1' });

    expect(visibleTabs(access)).toEqual(['schedule', 'products']);
  });

  it('shows Schedule, Quotes, and Products to an Admin', () => {
    const access = createUserAccessSummary({ role: 'admin', userId: 'admin-1' });

    expect(visibleTabs(access)).toEqual(['schedule', 'quotes', 'products']);
  });
});

describe('showTabBar', () => {
  it('stays collapsed when no tabs are visible', () => {
    expect(showTabBar([])).toBe(false);
  });

  it('collapses when Schedule is the only visible tab', () => {
    expect(showTabBar(['schedule'])).toBe(false);
  });

  it('renders when Products is also visible', () => {
    expect(showTabBar(['schedule', 'products'])).toBe(true);
  });
});
