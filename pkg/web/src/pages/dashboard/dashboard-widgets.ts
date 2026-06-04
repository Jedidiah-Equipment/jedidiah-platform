import type { DashboardWidget } from './dashboard-widget-types.js';
import { ProductsWidget } from './widgets/ProductsWidget.js';
import { QuotesByStatusWidget } from './widgets/QuotesByStatusWidget.js';
import { QuotesCreatedOverTimeWidget } from './widgets/QuotesCreatedOverTimeWidget.js';
import { RecentActivityWidget } from './widgets/RecentActivityWidget.js';
import { RecentQuotesWidget } from './widgets/RecentQuotesWidget.js';

export const dashboardWidgets = [
  {
    Component: RecentQuotesWidget,
    id: 'recent-quotes',
    requires: 'quote:read',
    size: 'md',
    title: 'Recent Quotes',
  },
  {
    Component: QuotesByStatusWidget,
    id: 'quotes-by-status',
    requires: 'quote:read',
    size: 'md',
    title: 'Quotes by status',
  },
  {
    Component: QuotesCreatedOverTimeWidget,
    id: 'quotes-created-over-time',
    requires: 'quote:read',
    size: 'md',
    title: 'Quotes created over time',
  },
  {
    Component: ProductsWidget,
    id: 'products',
    requires: 'product:read',
    size: 'md',
    title: 'Products',
  },
  {
    Component: RecentActivityWidget,
    id: 'recent-activity',
    requires: 'audit:read',
    size: 'md',
    title: 'Recent activity',
  },
] as const satisfies readonly DashboardWidget[];
