import type { DashboardWidget } from './dashboard-widget-types.js';
import { ActiveJobsWidget } from './widgets/ActiveJobsWidget.js';
import { AwaitingJobCreationWidget } from './widgets/AwaitingJobCreationWidget.js';
import { BayLoadTodayWidget } from './widgets/BayLoadTodayWidget.js';
import { BayRunwayWidget } from './widgets/BayRunwayWidget.js';
import { BelowMinimumStockWidget, OutOfStockWidget, ShortForJobsWidget } from './widgets/BuyListSignalWidgets.js';
import { CloseOutQueueWidget } from './widgets/CloseOutQueueWidget.js';
import { LatePurchaseOrdersWidget } from './widgets/LatePurchaseOrdersWidget.js';
import { OpenPipelineWidget } from './widgets/OpenPipelineWidget.js';
import { QuoteFlowWidget } from './widgets/QuoteFlowWidget.js';
import { QuotesByStatusWidget } from './widgets/QuotesByStatusWidget.js';
import { RecentActivityWidget } from './widgets/RecentActivityWidget.js';
import { ScheduledJobsWidget } from './widgets/ScheduledJobsWidget.js';
import { ShopFloorTodayWidget } from './widgets/ShopFloorTodayWidget.js';
import { StaleSentQuotesWidget } from './widgets/StaleSentQuotesWidget.js';
import { UpcomingDeliveriesWidget } from './widgets/UpcomingDeliveriesWidget.js';

export const dashboardWidgets = [
  {
    Component: OpenPipelineWidget,
    id: 'open-pipeline',
    requires: 'quote:read',
    size: 'xs',
    title: 'Open pipeline (retail, excl. VAT)',
  },
  {
    Component: ScheduledJobsWidget,
    id: 'scheduled-jobs',
    requires: 'job:read',
    size: 'xs',
    title: 'Scheduled jobs',
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
    Component: CloseOutQueueWidget,
    id: 'close-out-queue',
    requires: 'inventory:close-out',
    size: 'xs',
    title: 'Awaiting close-out',
  },
  {
    Component: OutOfStockWidget,
    id: 'out-of-stock',
    requires: 'inventory:read',
    size: 'xs',
    title: 'Out of stock',
  },
  {
    Component: BelowMinimumStockWidget,
    id: 'below-minimum-stock',
    requires: 'inventory:read',
    size: 'xs',
    title: 'Below minimum',
  },
  {
    Component: ShortForJobsWidget,
    id: 'short-for-jobs',
    requires: 'inventory:read',
    size: 'xs',
    title: 'Short for Jobs',
  },
  {
    Component: LatePurchaseOrdersWidget,
    id: 'late-purchase-orders',
    requires: 'purchase_order:read',
    size: 'xs',
    title: 'Late Purchase Orders',
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
    Component: AwaitingJobCreationWidget,
    id: 'awaiting-job-creation',
    requires: 'quote:read',
    size: 'sm',
    title: 'Awaiting Job creation',
  },
  {
    Component: UpcomingDeliveriesWidget,
    id: 'upcoming-deliveries',
    requires: 'quote:read',
    size: 'sm',
    title: 'Upcoming deliveries',
  },
  {
    Component: RecentActivityWidget,
    id: 'recent-activity',
    requires: 'audit:read',
    size: 'md',
    title: 'Recent activity',
  },
] as const satisfies readonly DashboardWidget[];
