import { accessForRole } from '@pkg/domain/testing';
import type { AppRole } from '@pkg/schema';
import { expect, it, vi } from 'vitest';

import { filterDashboardWidgets } from '@/components/common/dashboard/dashboard-widget-types.js';

import { contractingDashboardWidgets } from './dashboard-widgets.js';

vi.mock('./widgets/JobQueueTiles.js', () => ({
  AwaitingInvoiceTile: () => null,
  AwaitingPricingTile: () => null,
  LooksFinishedTile: () => null,
}));
vi.mock('./widgets/ReadingExceptionsTile.js', () => ({ ReadingExceptionsTile: () => null }));
vi.mock('./widgets/JobsNeedingALookWidget.js', () => ({ JobsNeedingALookWidget: () => null }));
vi.mock('./widgets/WorkshopWidget.js', () => ({ WorkshopWidget: () => null }));
vi.mock('./widgets/ServiceDueWidget.js', () => ({ ServiceDueWidget: () => null }));

const visibleTo = (role: AppRole) =>
  filterDashboardWidgets(accessForRole(role, 'someone'), contractingDashboardWidgets).map((widget) => widget.id);

it('shows each role only the blocks whose data it may read, tiles first', () => {
  expect(visibleTo('contracting-admin')).toEqual([
    'looks-finished',
    'awaiting-pricing',
    'awaiting-invoice',
    'reading-exceptions',
    'jobs-needing-a-look',
    'workshop',
    'service-due',
  ]);
  // Awaiting invoice is gated like the Invoicing page, which the manager does not open.
  expect(visibleTo('contracting-manager')).toEqual([
    'looks-finished',
    'awaiting-pricing',
    'reading-exceptions',
    'jobs-needing-a-look',
    'workshop',
    'service-due',
  ]);
  // The workshop manager reads every Job, but has no Reading Exceptions to resolve and no invoice to stamp.
  expect(visibleTo('workshop-manager')).toEqual([
    'looks-finished',
    'awaiting-pricing',
    'jobs-needing-a-look',
    'workshop',
    'service-due',
  ]);
  expect(visibleTo('contracting-invoicing')).toEqual(['awaiting-invoice']);
  expect(visibleTo('foreman')).toEqual([]);
});
