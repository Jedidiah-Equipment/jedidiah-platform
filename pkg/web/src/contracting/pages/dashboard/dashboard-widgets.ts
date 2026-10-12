import { jobQueueLabels } from '@pkg/domain/contracting';
import type { DashboardWidget } from '@/components/common/dashboard/dashboard-widget-types.js';
import { AwaitingInvoiceTile, AwaitingPricingTile, LooksFinishedTile } from './widgets/JobQueueTiles.js';
import { JobsNeedingALookWidget } from './widgets/JobsNeedingALookWidget.js';
import { ReadingExceptionsTile } from './widgets/ReadingExceptionsTile.js';
import { ServiceDueWidget } from './widgets/ServiceDueWidget.js';
import { WorkshopWidget } from './widgets/WorkshopWidget.js';

/** What needs a person now, tiles first; each block shows only to a role that may read what it lists. */
export const contractingDashboardWidgets = [
  {
    Component: LooksFinishedTile,
    id: 'looks-finished',
    requires: 'contracting_job:read',
    size: 'xs',
    title: jobQueueLabels['looks-finished'],
  },
  {
    Component: AwaitingPricingTile,
    id: 'awaiting-pricing',
    requires: 'contracting_job:read',
    size: 'xs',
    title: jobQueueLabels['awaiting-pricing'],
  },
  {
    Component: AwaitingInvoiceTile,
    id: 'awaiting-invoice',
    requires: 'contracting_job:read-priced',
    size: 'xs',
    title: jobQueueLabels['awaiting-invoice'],
  },
  {
    Component: ReadingExceptionsTile,
    id: 'reading-exceptions',
    requires: 'contracting_reading:update',
    size: 'xs',
    title: 'Reading exceptions',
  },
  {
    Component: JobsNeedingALookWidget,
    id: 'jobs-needing-a-look',
    requires: 'contracting_job:read',
    size: 'md',
    title: 'Jobs needing a look',
  },
  {
    Component: WorkshopWidget,
    id: 'workshop',
    requires: 'contracting_breakdown:read',
    size: 'md',
    title: 'Workshop',
  },
  {
    Component: ServiceDueWidget,
    id: 'service-due',
    requires: 'contracting_machine:read',
    size: 'md',
    title: 'Service due',
  },
] as const satisfies readonly DashboardWidget[];
