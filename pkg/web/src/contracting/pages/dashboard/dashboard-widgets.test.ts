import { accessForRole } from '@pkg/domain/testing';
import type { AppRole } from '@pkg/schema';
import { expect, it, vi } from 'vitest';

import { dashboardRowColumns, visibleContractingDashboardRows } from './dashboard-widgets.js';

vi.mock('./widgets/JobQueueTiles.js', () => ({
  ActiveJobsTile: () => null,
  AwaitingInvoiceTile: () => null,
  AwaitingPricingTile: () => null,
  LooksFinishedTile: () => null,
}));
vi.mock('./widgets/MachinesOnJobTile.js', () => ({ MachinesOnJobTile: () => null }));
vi.mock('./widgets/DailyHoursWidget.js', () => ({ DailyHoursWidget: () => null }));
vi.mock('./widgets/JobsNeedingALookWidget.js', () => ({ JobsNeedingALookWidget: () => null }));
vi.mock('./widgets/WorkshopWidget.js', () => ({ WorkshopWidget: () => null }));
vi.mock('./widgets/ServiceDueWidget.js', () => ({ ServiceDueWidget: () => null }));

const visibleTo = (role: AppRole) =>
  visibleContractingDashboardRows(accessForRole(role, 'someone')).map((row) => row.map((widget) => widget.id));

it('shows each role only the blocks whose data it may read, each row of tiles on its own line', () => {
  expect(visibleTo('contracting-admin')).toEqual([
    ['looks-finished', 'awaiting-pricing', 'awaiting-invoice'],
    ['active-jobs', 'machines-on-job', 'daily-hours'],
    ['jobs-needing-a-look', 'workshop', 'service-due'],
  ]);
  // Awaiting invoice is gated like the Invoicing page, which the manager does not open.
  expect(visibleTo('contracting-manager')).toEqual([
    ['looks-finished', 'awaiting-pricing'],
    ['active-jobs', 'machines-on-job', 'daily-hours'],
    ['jobs-needing-a-look', 'workshop', 'service-due'],
  ]);
  // The workshop manager reads every Job, but has no invoice to stamp.
  expect(visibleTo('workshop-manager')).toEqual([
    ['looks-finished', 'awaiting-pricing'],
    ['active-jobs', 'machines-on-job', 'daily-hours'],
    ['jobs-needing-a-look', 'workshop', 'service-due'],
  ]);
  expect(visibleTo('contracting-invoicing')).toEqual([['awaiting-invoice']]);
  expect(visibleTo('foreman')).toEqual([]);
});

it('sizes each row from the widgets a role sees, so no row leaves a gap', () => {
  expect(dashboardRowColumns([{ size: 'xs' }, { size: 'xs' }, { size: 'md' }])).toBe(
    'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr)',
  );
  expect(dashboardRowColumns([{ size: 'xs' }, { size: 'xs' }])).toBe('minmax(0, 1fr) minmax(0, 1fr)');
});
