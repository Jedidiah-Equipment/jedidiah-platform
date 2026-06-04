import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import type { DashboardWidget } from './dashboard-widget-types.js';
import { filterDashboardWidgets } from './dashboard-widget-types.js';

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

function widgetIds(widgets: DashboardWidget[]) {
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
