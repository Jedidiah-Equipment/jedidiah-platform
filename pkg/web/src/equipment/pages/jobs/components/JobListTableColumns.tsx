import { formatDate, getJobDisplayName, getJobDisplaySubtitle, getJobOfferingKind } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';
import { IconCheck, IconPencil, IconSubtask } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { StockBadge } from '@/components/common/StockBadge.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { Button } from '@/components/ui/button.js';

import { JobCodeDisplay } from './JobCodeDisplay.js';
import { JobScheduleStateBadges } from './JobScheduleStateBadges.js';

export const jobTablePinnedStartColumns = ['code'];
export const jobTablePinnedEndColumns = ['actions'];

type JobListColumnOption = {
  label: string;
  value: string;
};

/**
 * Job List columns. Start date and End date stay display-only because they are derived from opt-in
 * `scheduleState` projection; Complete reads the stored `completedOn`, so it sorts and filters
 * server-side. Its filter is offered only when completed Jobs are in the list at all — otherwise
 * every Complete cell is empty and a date range could only ever return nothing.
 */
export function createJobListColumns({
  canEditJobs,
  canFilterCompletedOn,
  canOpenJobs,
  customerOptions,
  showCustomerColumn,
}: {
  canEditJobs: boolean;
  canFilterCompletedOn: boolean;
  canOpenJobs: boolean;
  customerOptions: JobListColumnOption[];
  showCustomerColumn: boolean;
}): DataTableColumnDef<JobSummary>[] {
  return [
    {
      accessorFn: (job) => job.code,
      cell: ({ row }) => (
        <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={row.original.code} jobId={row.original.id} />
      ),
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Job',
      id: 'code',
      meta: {
        headerClassName: 'min-w-28',
      },
      size: 112,
    },
    ...(showCustomerColumn
      ? [
          {
            accessorFn: (job: JobSummary) => job.customerCompanyName,
            cell: ({ row }: { row: { original: JobSummary } }) => <CustomerCell job={row.original} />,
            enableColumnFilter: true,
            enableSorting: false,
            header: 'Customer',
            id: 'customer',
            meta: {
              cellClassName: 'max-w-52 overflow-hidden',
              filterOptions: customerOptions,
              filterVariant: 'select',
              headerClassName: 'min-w-44',
            },
          } satisfies DataTableColumnDef<JobSummary>,
        ]
      : []),
    {
      accessorFn: (job) => getJobDisplayName(job),
      cell: ({ row }) => <ProductCell job={row.original} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Product / Work title',
      id: 'product',
      meta: {
        headerClassName: 'min-w-56',
      },
    },
    {
      accessorFn: (job) => job.productUnit?.productSerialNumber ?? null,
      cell: ({ row }) =>
        row.original.productUnit ? (
          <span className="font-mono text-sm tabular-nums">{row.original.productUnit.productSerialNumber}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      enableColumnFilter: true,
      enableSorting: true,
      header: 'Serial',
      id: 'productSerialNumber',
      meta: {
        headerClassName: 'min-w-36',
      },
    },
    {
      accessorFn: (job) => job.scheduleState?.total ?? 0,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          <JobScheduleStateBadges scheduleState={row.original.scheduleState} />
        </div>
      ),
      enableColumnFilter: false,
      enableSorting: true,
      header: 'Schedule',
      id: 'scheduledSlots',
      meta: {
        headerClassName: 'min-w-44',
      },
    },
    {
      accessorFn: (job) => job.scheduleState?.firstWorkDay ?? null,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDate(row.original.scheduleState?.firstWorkDay, 'short', '—')}</span>
      ),
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Start date',
      id: 'startDate',
      meta: {
        headerClassName: 'min-w-28',
      },
    },
    {
      accessorFn: (job) => job.scheduleState?.lastWorkDay ?? null,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDate(row.original.scheduleState?.lastWorkDay, 'short', '—')}</span>
      ),
      enableColumnFilter: false,
      enableSorting: false,
      header: 'End date',
      id: 'endDate',
      meta: {
        headerClassName: 'min-w-28',
      },
    },
    {
      accessorFn: (job) => job.completedOn,
      cell: ({ row }) => <CompleteCell job={row.original} />,
      enableColumnFilter: canFilterCompletedOn,
      enableSorting: true,
      header: 'Complete',
      id: 'completedOn',
      meta: {
        filterVariant: 'date-range',
        headerClassName: 'min-w-28',
      },
    },
    ...(canOpenJobs
      ? [
          {
            cell: ({ row }: { row: { original: JobSummary } }) => (
              <JobActionsCell canEditJobs={canEditJobs} job={row.original} />
            ),
            enableColumnFilter: false,
            enableSorting: false,
            header: '',
            id: 'actions',
            meta: {
              cellClassName: 'w-[88px]',
            },
            size: 88,
          } satisfies DataTableColumnDef<JobSummary>,
        ]
      : []),
  ];
}

function JobActionsCell({ canEditJobs, job }: { canEditJobs: boolean; job: JobSummary }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        aria-label={`Open ${job.code} on the Gantt`}
        render={<Link search={{ job: job.id }} to="/equipment/jobs" onClick={(event) => event.stopPropagation()} />}
        size="icon"
        variant="ghost"
      >
        <IconSubtask />
      </Button>
      {canEditJobs ? (
        <Button
          aria-label={`Open ${job.code} details`}
          render={
            <Link search={{ job: job.id }} to="/equipment/jobs/list" onClick={(event) => event.stopPropagation()} />
          }
          size="icon"
          variant="ghost"
        >
          <IconPencil />
        </Button>
      ) : null}
    </div>
  );
}

function CompleteCell({ job }: { job: JobSummary }) {
  if (!job.completedOn) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 text-green-600 tabular-nums dark:text-green-500">
      <IconCheck aria-hidden className="size-4 shrink-0" />
      {formatDate(job.completedOn, 'short')}
    </span>
  );
}

function CustomerCell({ job }: { job: JobSummary }) {
  if (!job.customerCompanyName) {
    return <StockBadge />;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <EntityThumbnail label={job.customerCompanyName} size="sm" thumbnailDataUrl={job.customerThumbnailDataUrl} />
      <span className="min-w-0 truncate font-medium">{job.customerCompanyName}</span>
    </div>
  );
}

function ProductCell({ job }: { job: JobSummary }) {
  const displayName = getJobDisplayName(job);
  const subtitle = getJobDisplaySubtitle(job);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <OfferingThumbnail
        kind={getJobOfferingKind(job)}
        label={displayName}
        size="sm"
        thumbnailDataUrl={job.productThumbnailDataUrl}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{displayName}</span>
        {subtitle ? (
          <span className="truncate text-xs text-muted-foreground">
            {subtitle.mono ? <span className="font-mono">{subtitle.text}</span> : subtitle.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
