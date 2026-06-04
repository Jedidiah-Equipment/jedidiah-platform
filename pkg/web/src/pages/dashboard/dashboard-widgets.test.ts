import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardWidget } from './dashboard-widget-types.js';
import { filterDashboardWidgets } from './dashboard-widget-types.js';
import { dashboardWidgets } from './dashboard-widgets.js';

vi.mock('./widgets/RecentQuotesWidget.js', () => ({ RecentQuotesWidget: () => null }));
vi.mock('./widgets/QuotesByStatusWidget.js', () => ({ QuotesByStatusWidget: () => null }));

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

  it('keeps role-visible widgets in registry order for product editors', () => {
    const access = createUserAccessSummary({ role: 'product-editor', userId: 'user-1' });

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

  it('shows Recent Quotes to sales users and hides it from product editors', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'product-editor', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).toContain('recent-quotes');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain('recent-quotes');
  });

  it('shows Quotes by status to sales users and hides it from product editors', () => {
    const salesAccess = createUserAccessSummary({ role: 'sales', userId: 'user-1' });
    const productEditorAccess = createUserAccessSummary({ role: 'product-editor', userId: 'user-1' });

    expect(widgetIds(filterDashboardWidgets(salesAccess, dashboardWidgets))).toContain('quotes-by-status');
    expect(widgetIds(filterDashboardWidgets(productEditorAccess, dashboardWidgets))).not.toContain('quotes-by-status');
  });
});
