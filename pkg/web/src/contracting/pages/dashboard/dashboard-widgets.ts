import { jobQueueLabels } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import { type DashboardWidget, filterDashboardWidgets } from '@/components/common/dashboard/dashboard-widget-types.js';
import {
  ActiveJobsTile,
  AwaitingInvoiceTile,
  AwaitingPricingTile,
  LooksFinishedTile,
} from './widgets/JobQueueTiles.js';
import { JobsNeedingALookWidget } from './widgets/JobsNeedingALookWidget.js';
import { MachinesOnJobTile } from './widgets/MachinesOnJobTile.js';
import { ReadingExceptionsTile } from './widgets/ReadingExceptionsTile.js';
import { ServiceDueWidget } from './widgets/ServiceDueWidget.js';
import { WorkshopWidget } from './widgets/WorkshopWidget.js';

/** Each row starts a new line of the grid, so a role missing a tile never pulls the next row up into its gap. */
export const contractingDashboardRows = [
  [
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
  ],
  [
    {
      Component: ActiveJobsTile,
      id: 'active-jobs',
      requires: 'contracting_job:read',
      size: 'xs',
      title: 'Active jobs',
    },
    {
      Component: MachinesOnJobTile,
      id: 'machines-on-job',
      requires: 'contracting_machine:read',
      size: 'xs',
      title: 'Machines On Job',
    },
  ],
  [
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
  ],
] as const satisfies readonly (readonly DashboardWidget[])[];

export const visibleContractingDashboardRows = (access: Pick<UserAccessSummary, 'permissions'> | null | undefined) =>
  contractingDashboardRows.map((row) => filterDashboardWidgets(access, row)).filter((row) => row.length > 0);
