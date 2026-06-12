import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from './dashboard-widget-types.js';
import { filterDashboardWidgets } from './dashboard-widget-types.js';
import { dashboardWidgets } from './dashboard-widgets.js';

vi.mock('./widgets/ActiveJobsWidget.js', () => ({ ActiveJobsWidget: () => null }));
vi.mock('./widgets/AwaitingJobCreationWidget.js', () => ({ AwaitingJobCreationWidget: () => null }));
vi.mock('./widgets/BayLoadTodayWidget.js', () => ({ BayLoadTodayWidget: () => null }));
vi.mock('./widgets/BayRunwayWidget.js', () => ({ BayRunwayWidget: () => null }));
vi.mock('./widgets/ShopFloorTodayWidget.js', () => ({ ShopFloorTodayWidget: () => null }));
vi.mock('./widgets/QuotesByStatusWidget.js', () => ({ QuotesByStatusWidget: () => null }));
vi.mock('./widgets/OpenPipelineWidget.js', () => ({ OpenPipelineWidget: () => null }));
vi.mock('./widgets/WinRateWidget.js', () => ({ WinRateWidget: () => null }));
vi.mock('./widgets/QuoteFlowWidget.js', () => ({ QuoteFlowWidget: () => null }));
vi.mock('./widgets/StaleSentQuotesWidget.js', () => ({ StaleSentQuotesWidget: () => null }));
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
  it('registers Quotes by status behind quote read access', () => {
    const quotesByStatusWidget = dashboardWidgets.find((widget) => widget.id === 'quotes-by-status');

    expect(quotesByStatusWidget).toMatchObject({
      requires: 'quote:read',
      size: 'md',
      title: 'Quotes by status',
    });
  });

  it('registers the sales metrics widgets behind quote read access', () => {
    const openPipelineWidget = dashboardWidgets.find((widget) => widget.id === 'open-pipeline');
    const winRateWidget = dashboardWidgets.find((widget) => widget.id === 'win-rate');
    const quoteFlowWidget = dashboardWidgets.find((widget) => widget.id === 'quote-flow');
    const staleSentWidget = dashboardWidgets.find((widget) => widget.id === 'stale-sent-quotes');
    const awaitingJobCreationWidget = dashboardWidgets.find((widget) => widget.id === 'awaiting-job-creation');

    expect(openPipelineWidget).toMatchObject({ requires: 'quote:read', size: 'xs', title: 'Open pipeline (sent)' });
    expect(winRateWidget).toMatchObject({ requires: 'quote:read', size: 'xs', title: 'Win rate (90d)' });
    expect(quoteFlowWidget).toMatchObject({ requires: 'quote:read', size: 'md', title: 'Quote flow' });
    expect(staleSentWidget).toMatchObject({ requires: 'quote:read', size: 'sm', title: 'Stale sent quotes' });
    expect(awaitingJobCreationWidget).toMatchObject({
      requires: 'quote:read',
      size: 'sm',
      title: 'Awaiting Job creation',
    });
  });

  it('removes the retired widgets from the registry', () => {
    expect(widgetIds(dashboardWidgets)).not.toContain('quotes-created-over-time');
    expect(widgetIds(dashboardWidgets)).not.toContain('recent-quotes');
    expect(widgetIds(dashboardWidgets)).not.toContain('products');
  });

  it('registers Recent activity behind audit read access', () => {
    const recentActivityWidget = dashboardWidgets.find((widget) => widget.id === 'recent-activity');

    expect(recentActivityWidget).toMatchObject({
      requires: 'audit:read',
      size: 'md',
      title: 'Recent activity',
    });
  });

  it('shows Quotes by status to sales users and hides it from procurement managers', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).toContain('quotes-by-status');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain('quotes-by-status');
  });

  it('shows the sales metrics widgets to sales users and hides them from procurement managers', () => {
    const salesMetricsWidgetIds = [
      'open-pipeline',
      'win-rate',
      'quote-flow',
      'stale-sent-quotes',
      'awaiting-job-creation',
    ];
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'procurement-manager', userId: 'user-1' });

    const salesIds = widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets));
    const productEditorIds = widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets));

    for (const widgetId of salesMetricsWidgetIds) {
      expect(salesIds).toContain(widgetId);
      expect(productEditorIds).not.toContain(widgetId);
    }
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
