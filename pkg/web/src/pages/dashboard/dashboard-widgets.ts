import type { DashboardWidget } from './dashboard-widget-types.js';
import { ActiveJobsWidget } from './widgets/ActiveJobsWidget.js';
import { BayLoadTodayWidget } from './widgets/BayLoadTodayWidget.js';
import { BayRunwayWidget } from './widgets/BayRunwayWidget.js';
import { OpenPipelineWidget } from './widgets/OpenPipelineWidget.js';
import { ProductsWidget } from './widgets/ProductsWidget.js';
import { QuoteFlowWidget } from './widgets/QuoteFlowWidget.js';
import { QuotesByStatusWidget } from './widgets/QuotesByStatusWidget.js';
import { RecentActivityWidget } from './widgets/RecentActivityWidget.js';
import { RecentQuotesWidget } from './widgets/RecentQuotesWidget.js';
import { ShopFloorTodayWidget } from './widgets/ShopFloorTodayWidget.js';
import { StaleSentQuotesWidget } from './widgets/StaleSentQuotesWidget.js';
import { WinRateWidget } from './widgets/WinRateWidget.js';

export const dashboardWidgets = [
  {
    Component: OpenPipelineWidget,
    id: 'open-pipeline',
    requires: 'quote:read',
    size: 'xs',
    title: 'Open pipeline (sent)',
  },
  {
    Component: WinRateWidget,
    id: 'win-rate',
    requires: 'quote:read',
    size: 'xs',
    title: 'Win rate (90d)',
  },
  {
    Component: ActiveJobsWidget,
    id: 'active-jobs',
    requires: 'job:read',
    size: 'xs',
    title: 'Active jobs',
  },
  {
    Component: BayLoadTodayWidget,
    id: 'bay-load-today',
    requires: 'job:read',
    size: 'xs',
    title: 'Bay load today',
  },
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
    Component: QuoteFlowWidget,
    id: 'quote-flow',
    requires: 'quote:read',
    size: 'md',
    title: 'Quote flow',
  },
  {
    Component: ShopFloorTodayWidget,
    id: 'shop-floor-today',
    requires: 'job:read',
    size: 'lg',
    title: 'Shop floor today',
  },
  {
    Component: BayRunwayWidget,
    id: 'bay-runway',
    requires: 'job:read',
    size: 'sm',
    title: 'Bay runway',
  },
  {
    Component: StaleSentQuotesWidget,
    id: 'stale-sent-quotes',
    requires: 'quote:read',
    size: 'sm',
    title: 'Stale sent quotes',
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
