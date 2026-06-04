import type { DashboardWidget } from './dashboard-widget-types.js';
import { RecentQuotesWidget } from './widgets/RecentQuotesWidget.js';

export const dashboardWidgets = [
  {
    Component: RecentQuotesWidget,
    id: 'recent-quotes',
    requires: 'quote:read',
    size: 'md',
    title: 'Recent Quotes',
  },
] as const satisfies readonly DashboardWidget[];
