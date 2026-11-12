import { jobQueueLabels, readsJobMoney } from '@pkg/domain/contracting';
import type { DashboardRows } from '@/components/common/dashboard/dashboard-rows.js';
import { DailyHoursWidget } from './widgets/DailyHoursWidget.js';
import { InvoicedByMonthWidget } from './widgets/InvoicedByMonthWidget.js';
import {
  ActiveJobsTile,
  AwaitingInvoiceTile,
  AwaitingPricingTile,
  LooksFinishedTile,
} from './widgets/JobQueueTiles.js';
import { JobsNeedingALookWidget } from './widgets/JobsNeedingALookWidget.js';
import { MachinesOnJobTile } from './widgets/MachinesOnJobTile.js';
import { ServiceDueWidget } from './widgets/ServiceDueWidget.js';
import { WorkshopWidget } from './widgets/WorkshopWidget.js';

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
  ],
  [
    {
      Component: InvoicedByMonthWidget,
      id: 'invoiced-by-month',
      requires: readsJobMoney,
      size: 'xl',
      title: 'Invoiced by month (ex VAT)',
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
    {
      Component: DailyHoursWidget,
      id: 'daily-hours',
      requires: 'contracting_report:read',
      size: 'md',
      title: 'Daily hours',
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
      requires: 'contracting_service:read',
      size: 'md',
      title: 'Service due',
    },
  ],
] as const satisfies DashboardRows;
