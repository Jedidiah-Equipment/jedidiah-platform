import { accessForRole } from '@pkg/domain/testing';
import { describe, expect, it } from 'vitest';

import { type AppTab, activeAppTab, appTabHref, showTabBar, visibleTabs } from './app-tabs';

describe('visibleTabs', () => {
  it('shows no tabs while access is unresolved', () => {
    expect(visibleTabs(undefined)).toEqual([]);
    expect(visibleTabs(null)).toEqual([]);
  });

  it('shows Activity first, then Jobs, Plan, and Units to a Job Viewer', () => {
    const access = accessForRole('job-viewer', 'viewer-1');

    expect(visibleTabs(access)).toEqual(['activity', 'jobs', 'plan', 'units']);
  });

  it('shows Quotes and Units to Sales', () => {
    const access = accessForRole('sales', 'sales-1');

    expect(visibleTabs(access)).toEqual(['quotes', 'units']);
  });

  it('shows Activity first, then Jobs, Plan, Quotes, Products, and Units to a Procurement Manager', () => {
    const access = accessForRole('procurement-manager', 'buyer-1');

    expect(visibleTabs(access)).toEqual(['activity', 'jobs', 'plan', 'quotes', 'products', 'units']);
  });

  it('shows every tab to an Admin', () => {
    const access = accessForRole('admin', 'admin-1');

    expect(visibleTabs(access)).toEqual(['activity', 'jobs', 'plan', 'quotes', 'products', 'units', 'stores']);
  });

  /**
   * The tablet's whole surface: physical stock flows, and no paperwork tab to wander into. Being a
   * single tab, the bar collapses — so the signed-in landing has to redirect it to `/stores` rather
   * than the no-access screen, which would leave the tablet with no way in at all.
   */
  it('shows only Stores to the Stores Tablet', () => {
    const access = accessForRole('stores', 'tablet-1');

    expect(visibleTabs(access)).toEqual(['stores']);
    expect(showTabBar(visibleTabs(access))).toBe(false);
  });

  it('keeps Stores away from a Procurement Manager, who has no right to move stock', () => {
    const access = accessForRole('procurement-manager', 'buyer-1');

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
    const tabs: AppTab[] = ['activity', 'jobs', 'plan', 'quotes', 'products', 'units', 'stores'];

    expect(tabs.map(appTabHref)).toEqual([
      '/equipment/activity',
      '/equipment/jobs',
      '/equipment/plan',
      '/equipment/quotes',
      '/equipment/products',
      '/equipment/units',
      '/equipment/stores',
    ]);
  });
});

describe('activeAppTab', () => {
  it('reads the tab from the segment below the tabs group', () => {
    expect(activeAppTab(['(protected)', 'equipment', '(tabs)', 'activity'])).toBe('activity');
    expect(activeAppTab(['(protected)', 'equipment', '(tabs)', 'jobs', '[jobId]'])).toBe('jobs');
    expect(activeAppTab(['(protected)', 'equipment', '(tabs)', 'stores', 'parts', '[partCode]', 'checkout'])).toBe(
      'stores',
    );
  });

  it('keeps a Bay schedule on Plan, which owns the route group', () => {
    expect(activeAppTab(['(protected)', 'equipment', '(tabs)', '(plan)', 'bays', '[bayId]'])).toBe('plan');
  });

  it('has no active tab outside the tabs group', () => {
    expect(activeAppTab(['login'])).toBeNull();
    expect(activeAppTab([])).toBeNull();
  });
});
