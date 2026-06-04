import type { DashboardWidget } from './dashboard-widget-types.js';
import { QuotesByStatusWidget } from './widgets/QuotesByStatusWidget.js';
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
] as const satisfies readonly DashboardWidget[];
