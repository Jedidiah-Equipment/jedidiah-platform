import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from './dashboard-widget-types.js';
import { filterDashboardWidgets } from './dashboard-widget-types.js';
import { dashboardWidgets } from './dashboard-widgets.js';

vi.mock('./widgets/ActiveJobsWidget.js', () => ({ ActiveJobsWidget: () => null }));
vi.mock('./widgets/BayLoadTodayWidget.js', () => ({ BayLoadTodayWidget: () => null }));
vi.mock('./widgets/BayRunwayWidget.js', () => ({ BayRunwayWidget: () => null }));
vi.mock('./widgets/ShopFloorTodayWidget.js', () => ({ ShopFloorTodayWidget: () => null }));
vi.mock('./widgets/RecentQuotesWidget.js', () => ({ RecentQuotesWidget: () => null }));
vi.mock('./widgets/QuotesByStatusWidget.js', () => ({ QuotesByStatusWidget: () => null }));
vi.mock('./widgets/QuotesCreatedOverTimeWidget.js', () => ({ QuotesCreatedOverTimeWidget: () => null }));
vi.mock('./widgets/ProductsWidget.js', () => ({ ProductsWidget: () => null }));
vi.mock('./widgets/RecentActivityWidget.js', () => ({ RecentActivityWidget: () => null }));

const WidgetComponent = () => null;

const fixtureWidgets: DashboardWidget[] = [
  {
    Component: WidgetComponent,
    id: 'welcome',
    size: 'lg',
    title: 'Welcome',
  },
  {
    Component: WidgetComponent,
    id: 'quotes',
    requires: 'quote:read',
    size: 'md',
    title: 'Quotes',
  },
  {
    Component: WidgetComponent,
    id: 'products',
    requires: 'product:read',
    size: 'md',
    title: 'Products',
  },
  {
    Component: WidgetComponent,
    id: 'audit',
    requires: 'audit:read',
    size: 'sm',
    title: 'Audit',
  },
];

function widgetIds(widgets: readonly Pick<DashboardWidget, 'id'>[]) {
  return widgets.map((widget) => widget.id);
}

describe('filterDashboardWidgets', () => {
  it('keeps unconditional widgets while access is unavailable', () => {
    expect(widgetIds(filterDashboardWidgets(undefined, fixtureWidgets))).toEqual(['welcome']);
  });

  it('keeps role-visible widgets in registry order for sales', () => {
    const access = createUserAccessSummary({ role: 'sales', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(access, fixtureWidgets))).toEqual(['welcome', 'quotes']);
  });

  it('keeps role-visible widgets in registry order for procurement managers', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(access, fixtureWidgets))).toEqual(['welcome', 'products']);
  });

  it('keeps all registered widgets for admins without reordering them', () => {
    const access = createUserAccessSummary({ role: 'admin', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(access, fixtureWidgets))).toEqual([
      'welcome',
      'quotes',
      'products',
      'audit',
    ]);
  });
});

describe('dashboardWidgets', () => {
  it('registers Recent Quotes behind quote read access', () => {
    const recentQuotesWidget = dashboardWidgets.find((widget) => widget.id === 'recent-quotes');

    expect(recentQuotesWidget).toMatchObject({
      requires: 'quote:read',
      size: 'md',
      title: 'Recent Quotes',
    });
  });

  it('registers Quotes by status behind quote read access', () => {
    const quotesByStatusWidget = dashboardWidgets.find((widget) => widget.id === 'quotes-by-status');

    expect(quotesByStatusWidget).toMatchObject({
      requires: 'quote:read',
      size: 'md',
      title: 'Quotes by status',
    });
  });

  it('registers Quotes created over time behind quote read access', () => {
    const quotesCreatedWidget = dashboardWidgets.find((widget) => widget.id === 'quotes-created-over-time');

    expect(quotesCreatedWidget).toMatchObject({
      requires: 'quote:read',
      size: 'md',
      title: 'Quotes created over time',
    });
  });

  it('registers Products behind product read access', () => {
    const productsWidget = dashboardWidgets.find((widget) => widget.id === 'products');

    expect(productsWidget).toMatchObject({
      requires: 'product:read',
      size: 'md',
      title: 'Products',
    });
  });

  it('registers Recent activity behind audit read access', () => {
    const recentActivityWidget = dashboardWidgets.find((widget) => widget.id === 'recent-activity');

    expect(recentActivityWidget).toMatchObject({
      requires: 'audit:read',
      size: 'md',
      title: 'Recent activity',
    });
  });

  it('shows Recent Quotes to sales users and hides it from procurement managers', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).toContain('recent-quotes');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain('recent-quotes');
  });

  it('shows Quotes by status to sales users and hides it from procurement managers', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).toContain('quotes-by-status');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain('quotes-by-status');
  });

  it('shows quote widgets to sales users and hides them from procurement managers', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).toContain('quotes-created-over-time');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain(
      'quotes-created-over-time',
    );
  });

  it('shows Products to procurement managers and hides it from sales users', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).toContain('products');
    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).not.toContain('products');
  });

  it('registers the shop-floor band behind job read access', () => {
    const shopFloorWidget = dashboardWidgets.find((widget) => widget.id === 'shop-floor-today');
    const bayRunwayWidget = dashboardWidgets.find((widget) => widget.id === 'bay-runway');
    const activeJobsWidget = dashboardWidgets.find((widget) => widget.id === 'active-jobs');
    const bayLoadWidget = dashboardWidgets.find((widget) => widget.id === 'bay-load-today');

    expect(shopFloorWidget).toMatchObject({ requires: 'job:read', size: 'lg', title: 'Shop floor today' });
    expect(bayRunwayWidget).toMatchObject({ requires: 'job:read', size: 'sm', title: 'Bay runway' });
    expect(activeJobsWidget).toMatchObject({ requires: 'job:read', size: 'xs', title: 'Active jobs' });
    expect(bayLoadWidget).toMatchObject({ requires: 'job:read', size: 'xs', title: 'Bay load today' });
  });

  it('shows the shop-floor band to job viewers and procurement managers and hides it from sales', () => {
    const shopFloorWidgetIds = ['active-jobs', 'bay-load-today', 'shop-floor-today', 'bay-runway'];
    const jobViewerAccess = createUserAccessSummary({ role: 'job-viewer', userId: 'user-1' });
    const procurementAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });

    const jobViewerIds = widgetIds(filterDashboardWidgets(jobViewerAccess, dashboardWidgets));
    const procurementIds = widgetIds(filterDashboardWidgets(procurementAccess, dashboardWidgets));
    const salesIds = widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets));

    for (const widgetId of shopFloorWidgetIds) {
      expect(jobViewerIds).toContain(widgetId);
      expect(procurementIds).toContain(widgetId);
      expect(salesIds).not.toContain(widgetId);
    }
  });

  it('shows Recent activity only to admins', () => {
    const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'user-1' });
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(adminAccess, dashboardWidgets))).toContain('recent-activity');
    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).not.toContain('recent-activity');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain('recent-activity');
  });
});
