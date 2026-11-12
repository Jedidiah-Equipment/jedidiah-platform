import { accessForRole } from '@pkg/domain/testing';
import type { AppRole } from '@pkg/schema';
import { expect, it, vi } from 'vitest';

import { visibleDashboardRows } from '@/components/common/dashboard/dashboard-rows.js';
import { equipmentDashboardRows } from './dashboard-widgets.js';

vi.mock('./widgets/ActiveJobsWidget.js', () => ({ ActiveJobsWidget: () => null }));
vi.mock('./widgets/AwaitingJobCreationWidget.js', () => ({ AwaitingJobCreationWidget: () => null }));
vi.mock('./widgets/BayLoadTodayWidget.js', () => ({ BayLoadTodayWidget: () => null }));
vi.mock('./widgets/BayRunwayWidget.js', () => ({ BayRunwayWidget: () => null }));
vi.mock('./widgets/InvoicedByMonthWidget.js', () => ({ InvoicedByMonthWidget: () => null }));
vi.mock('./widgets/InventoryKpiWidgets.js', () => ({
  InventoryTurnsWidget: () => null,
  InventoryValueWidget: () => null,
  TopInventoryAdjustmentsWidget: () => null,
  TopScrapItemsWidget: () => null,
}));
vi.mock('./widgets/QuoteFlowWidget.js', () => ({ QuoteFlowWidget: () => null }));
vi.mock('./widgets/QuoteStageTiles.js', () => ({
  AwaitingApprovalTile: () => null,
  AwaitingInvoiceTile: () => null,
  AwaitingPricingTile: () => null,
}));
vi.mock('./widgets/QuotesByStatusWidget.js', () => ({ QuotesByStatusWidget: () => null }));
vi.mock('./widgets/ScheduledJobsWidget.js', () => ({ ScheduledJobsWidget: () => null }));
vi.mock('./widgets/ShopFloorTodayWidget.js', () => ({ ShopFloorTodayWidget: () => null }));
vi.mock('./widgets/StaleSentQuotesWidget.js', () => ({ StaleSentQuotesWidget: () => null }));
vi.mock('./widgets/UpcomingDeliveriesWidget.js', () => ({ UpcomingDeliveriesWidget: () => null }));

const visibleTo = (role: AppRole) =>
  visibleDashboardRows(accessForRole(role, 'someone'), equipmentDashboardRows).map((row) =>
    row.map((widget) => widget.id),
  );

const stageTiles = ['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice'];
const quoteRows = [
  ['quotes-by-status', 'quote-flow'],
  ['stale-sent-quotes', 'awaiting-job-creation', 'upcoming-deliveries'],
];
const jobRows = [
  ['scheduled-jobs', 'active-jobs', 'bay-load-today'],
  ['shop-floor-today', 'bay-runway'],
];
const inventoryRow = ['inventory-value', 'inventory-turns', 'top-inventory-adjustments', 'top-scrap-items'];

it('shows each role only the blocks whose data it may read, each row on its own line', () => {
  // Sales reads Quotes but prices none, so Invoiced by month leaves its row rather than pulling the next one up.
  expect(visibleTo('sales')).toEqual([stageTiles, ...quoteRows]);
  for (const role of ['admin', 'super-admin'] as const) {
    expect(visibleTo(role)).toEqual([
      stageTiles,
      ['invoiced-by-month'],
      jobRows[0],
      quoteRows[0],
      jobRows[1],
      quoteRows[1],
      inventoryRow,
    ]);
  }
  expect(visibleTo('job-viewer')).toEqual(jobRows);
});
