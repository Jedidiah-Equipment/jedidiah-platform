import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { type AppTab, activeAppTab, appTabHref, showTabBar, visibleTabs } from './app-tabs';

describe('visibleTabs', () => {
  it('shows no tabs while access is unresolved', () => {
    expect(visibleTabs(undefined)).toEqual([]);
    expect(visibleTabs(null)).toEqual([]);
  });

  it('shows Jobs, Plan, and Units to a Job Viewer', () => {
    const access = createUserAccessSummary({ role: 'job-viewer', userId: 'viewer-1' });

    expect(visibleTabs(access)).toEqual(['jobs', 'plan', 'units']);
  });

  it('shows Quotes and Units to Sales', () => {
    const access = createUserAccessSummary({ role: 'sales', userId: 'sales-1' });

    expect(visibleTabs(access)).toEqual(['quotes', 'units']);
  });

  it('shows Jobs, Plan, Products, and Units to a Procurement Manager', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'buyer-1' });

    expect(visibleTabs(access)).toEqual(['jobs', 'plan', 'products', 'units']);
  });

  it('shows every tab to an Admin', () => {
    const access = createUserAccessSummary({ role: 'admin', userId: 'admin-1' });

    expect(visibleTabs(access)).toEqual(['jobs', 'plan', 'stores', 'quotes', 'products', 'units']);
  });

  /**
   * The tablet's whole surface: physical stock flows, and no paperwork tab to wander into. Being a
   * single tab, the bar collapses — so the signed-in landing has to redirect it to `/stores` rather
   * than the no-access screen, which would leave the tablet with no way in at all.
   */
  it('shows only Stores to the Stores Tablet', () => {
    const access = createUserAccessSummary({ role: 'stores', userId: 'tablet-1' });

    expect(visibleTabs(access)).toEqual(['stores']);
    expect(showTabBar(visibleTabs(access))).toBe(false);
  });

  it('keeps Stores away from a Procurement Manager, who has no right to move stock', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'buyer-1' });

    expect(visibleTabs(access)).not.toContain('stores');
  });
});

describe('showTabBar', () => {
  it('stays collapsed when no tabs are visible', () => {
    expect(showTabBar([])).toBe(false);
  });

  it('collapses when one tab is visible', () => {
    expect(showTabBar(['jobs'])).toBe(false);
  });

  it('renders once Units joins a single other tab', () => {
    // Every role reads Units, so the roles that used to see one tab now get a bar.
    expect(showTabBar(['jobs', 'plan', 'units'])).toBe(true);
  });

  it('renders when Products is also visible', () => {
    expect(showTabBar(['jobs', 'plan', 'products'])).toBe(true);
  });
});

describe('appTabHref', () => {
  it('maps the permission order to each root route', () => {
    const tabs: AppTab[] = ['jobs', 'plan', 'stores', 'quotes', 'products', 'units'];

    expect(tabs.map(appTabHref)).toEqual(['/jobs', '/plan', '/stores', '/quotes', '/products', '/units']);
  });
});

describe('activeAppTab', () => {
  it('reads the tab from the segment below the tabs group', () => {
    expect(activeAppTab(['(protected)', '(tabs)', 'jobs', '[jobId]'])).toBe('jobs');
    expect(activeAppTab(['(protected)', '(tabs)', 'stores', 'parts', '[partCode]', 'checkout'])).toBe('stores');
  });

  it('keeps a Bay schedule on Plan, which owns the route group', () => {
    expect(activeAppTab(['(protected)', '(tabs)', '(plan)', 'bays', '[bayId]'])).toBe('plan');
  });

  it('has no active tab outside the tabs group', () => {
    expect(activeAppTab(['login'])).toBeNull();
    expect(activeAppTab([])).toBeNull();
  });
});
