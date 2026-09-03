import type { DashboardWidget } from './dashboard-widget-types.js';
import { ActiveJobsWidget } from './widgets/ActiveJobsWidget.js';
import { AwaitingJobCreationWidget } from './widgets/AwaitingJobCreationWidget.js';
import { BayLoadTodayWidget } from './widgets/BayLoadTodayWidget.js';
import { BayRunwayWidget } from './widgets/BayRunwayWidget.js';
import {
  InventoryTurnsWidget,
  InventoryValueWidget,
  TopInventoryAdjustmentsWidget,
  TopScrapItemsWidget,
} from './widgets/InventoryKpiWidgets.js';
import { OpenPipelineWidget } from './widgets/OpenPipelineWidget.js';
import { QuoteFlowWidget } from './widgets/QuoteFlowWidget.js';
import { QuotesByStatusWidget } from './widgets/QuotesByStatusWidget.js';
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
    size: 'md',
    title: 'Shop floor today',
  },
  {
    Component: BayRunwayWidget,
    id: 'bay-runway',
    requires: 'job:read',
    size: 'md',
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
    Component: InventoryValueWidget,
    id: 'inventory-value',
    requires: 'inventory_cost:read',
    size: 'xs',
    title: 'Inventory value',
  },
  {
    Component: InventoryTurnsWidget,
    id: 'inventory-turns',
    requires: 'inventory_cost:read',
    size: 'xs',
    title: 'Inventory turns',
  },
  {
    Component: TopInventoryAdjustmentsWidget,
    id: 'top-inventory-adjustments',
    requires: 'inventory_cost:read',
    size: 'xs',
    title: 'Top adjustments this month',
  },
  {
    Component: TopScrapItemsWidget,
    id: 'top-scrap-items',
    requires: 'inventory_cost:read',
    size: 'xs',
    title: 'Top scrap this month',
  },
] as const satisfies readonly DashboardWidget[];
