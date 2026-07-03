import { formatDate, getJobDisplayName, getJobDisplaySubtitle, isJobScheduleComplete } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';
import { IconCheck, IconPencil, IconTimeline } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';

import { JobCodeDisplay } from './JobCodeDisplay.js';
import { JobScheduleStateBadges } from './JobScheduleStateBadges.js';

/**
 * Job List columns. Only Job code (`code`) and Schedule (`scheduledSlots`) map to a server sort key
 * in `JobSortBy`; Customer, Product, and Serial are display-only. Schedule renders the shared Slice 2
 * badges from each Job's opt-in `scheduleState`. Start date, End date, and Is Complete are also
 * display-only for now (no server sort/filter) and are derived from that same `scheduleState`
 * projection: the earliest Slot start, the latest Slot end, and whether every Slot is done.
 */
export function createJobListColumns({
  canEditJobs,
  canOpenJobs,
}: {
  canEditJobs: boolean;
  canOpenJobs: boolean;
}): ColumnDef<JobSummary>[] {
  return [
    {
      accessorFn: (job) => job.code,
      cell: ({ row }) => (
        <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={row.original.code} jobId={row.original.id} />
      ),
      enableColumnFilter: false,
      enableSorting: true,
      header: 'Job',
      id: 'code',
      meta: {
        headerClassName: 'min-w-32',
      },
    },
    {
      accessorFn: (job) => job.customerCompanyName,
      cell: ({ row }) => <CustomerCell job={row.original} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Customer',
      id: 'customer',
      meta: {
        cellClassName: 'max-w-52 overflow-hidden',
        headerClassName: 'min-w-44',
      },
    },
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
      accessorFn: (job) => job.productSerialNumber,
      cell: ({ row }) =>
        row.original.productSerialNumber ? (
          <span className="font-mono text-sm tabular-nums">{row.original.productSerialNumber}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Serial',
      id: 'serial',
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
      accessorFn: (job) => job.scheduleState?.startDate ?? null,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDate(row.original.scheduleState?.startDate, 'short', '—')}</span>
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
      accessorFn: (job) => job.scheduleState?.endDate ?? null,
      cell: ({ row }) => (
        <span className="tabular-nums">{formatDate(row.original.scheduleState?.endDate, 'short', '—')}</span>
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
      accessorFn: (job) => (job.scheduleState ? isJobScheduleComplete(job.scheduleState) : false),
      cell: ({ row }) => <CompleteCell job={row.original} />,
      enableColumnFilter: false,
      enableSorting: false,
      header: 'Complete',
      id: 'isComplete',
      meta: {
        headerClassName: 'min-w-24',
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
              cellClassName: 'w-20',
            },
          } satisfies ColumnDef<JobSummary>,
        ]
      : []),
  ];
}

function JobActionsCell({ canEditJobs, job }: { canEditJobs: boolean; job: JobSummary }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        aria-label={`Open ${job.code} on the Gantt`}
        render={<Link search={{ job: job.id }} to="/jobs" onClick={(event) => event.stopPropagation()} />}
        size="icon"
        variant="ghost"
      >
        <IconTimeline />
      </Button>
      {canEditJobs ? (
        <Button
          aria-label={`Edit ${job.code}`}
          render={<Link params={{ id: job.id }} to="/jobs/$id/edit" onClick={(event) => event.stopPropagation()} />}
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
  if (!job.scheduleState || !isJobScheduleComplete(job.scheduleState)) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-500">
      <IconCheck aria-hidden className="size-4 shrink-0" />
      <span className="sr-only">Complete</span>
    </span>
  );
}

function CustomerCell({ job }: { job: JobSummary }) {
  if (!job.customerCompanyName) {
    return <span className="text-muted-foreground">Standalone</span>;
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
      <EntityThumbnail label={displayName} size="sm" thumbnailDataUrl={job.productThumbnailDataUrl} />
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
