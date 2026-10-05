import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import { jobQueueLabels, jobQueueOf } from '@pkg/domain/contracting';
import { type JobListInput, type JobQueueCounts, type JobSummary, jobQueues } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobCardPreviewSheet } from '../jobs/JobCardPreviewSheet.js';
import { JobStageQuickFilters } from '../jobs/JobStageQuickFilters.js';
import { JobQueueBadge } from '../jobs/JobStatusBadge.js';
import { STAGE_COLUMN_ID } from '../jobs/job-stage-filter.js';
import { type StampableJob, StampInvoiceDialog } from './StampInvoiceDialog.js';
import { INVOICED_COLUMN_ID, invoicedRange, invoicingStages, listedInvoicingStages } from './types.js';

/** Awaiting invoice is Invoicing's only quick filter; Invoiced stays in the Stage column filter. */
const awaitingStages = ['awaiting-invoice'] as const;

const useInvoicingTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: INVOICED_COLUMN_ID, desc: true }] },
  persistName: 'contracting-invoicing-table',
});

const noCounts = Object.fromEntries(jobQueues.map((queue) => [queue, 0])) as JobQueueCounts;

const invoicingSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: [INVOICED_COLUMN_ID, 'jobNumber'],
  defaultSort: { id: INVOICED_COLUMN_ID, desc: true },
};

const stageFilterOptions = invoicingStages.map((queue) => ({ value: queue, label: jobQueueLabels[queue] }));

export function InvoicingPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canStamp = useCan('contracting_invoice:update').can;
  const [stamping, setStamping] = useState<StampableJob | null>(null);
  const [previewing, setPreviewing] = useState<JobSummary | null>(null);
  const queues = useQuery(trpc.contractingJobs.jobs.queues.queryOptions());
  // The default stages depend on what is waiting, so the list waits for the counts rather than guess.
  const counts = queues.data?.counts ?? noCounts;
  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) => ({
      queues: listedInvoicingStages(columnFilters, counts),
      ...invoicedRange(columnFilters),
    }),
    [counts],
  );
  const tableController = useServerSideTableController({
    store: useInvoicingTableStore,
    sortOptions: invoicingSortOptions,
    getListInputExtras,
  });
  const jobsQuery = useInfiniteQuery(
    trpc.contractingJobs.jobs.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      enabled: queues.isSuccess,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: jobs, total } = useCombinedCursorQueryPages(jobsQuery.data?.pages);
  const columns = useMemo<DataTableColumnDef<JobSummary>[]>(
    () => [
      {
        accessorKey: INVOICED_COLUMN_ID,
        header: 'Invoiced',
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterVariant: 'date-range', headerClassName: 'min-w-36' },
        cell: ({ row }) => formatDate(row.original.invoicedAt, 'short', '—'),
      },
      {
        accessorKey: 'jobNumber',
        header: 'Job',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.jobNumber}</span>,
      },
      {
        id: STAGE_COLUMN_ID,
        accessorFn: jobQueueOf,
        header: 'Stage',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: stageFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-36' },
        cell: ({ row }) => <JobQueueBadge queue={jobQueueOf(row.original)} />,
      },
      {
        id: 'customer',
        header: 'Customer · Farm',
        cell: ({ row }) => `${row.original.customerName} · ${row.original.farmName}`,
      },
      { id: 'work-type', header: 'Work type', cell: ({ row }) => row.original.workTypeName },
      {
        id: 'total',
        header: 'Total ex VAT',
        cell: ({ row }) => (row.original.pricedTotal === null ? '—' : formatCurrency(row.original.pricedTotal)),
      },
      { id: 'priced', header: 'Priced', cell: ({ row }) => formatDate(row.original.pricedAt, 'short', '—') },
      {
        id: 'invoice-number',
        header: 'Invoice №',
        cell: ({ row }) => {
          const { invoiceNumber, pricedTotal } = row.original;
          if (invoiceNumber) return <span className="font-mono">{invoiceNumber}</span>;
          return canStamp && pricedTotal !== null ? (
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setStamping({ ...row.original, pricedTotal });
              }}
            >
              Stamp
            </Button>
          ) : null;
        },
      },
      {
        id: 'job-card',
        header: 'Job card',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              setPreviewing(row.original);
            }}
          >
            Job card
          </Button>
        ),
      },
    ],
    [canStamp],
  );
  const table = useDataTable({
    columns,
    data: jobs,
    enableSortingRemoval: false,
    manualFiltering: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onSortingChange: tableController.setSorting,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      sorting: tableController.sorting,
    },
  });
  const listed = listedInvoicingStages(tableController.columnFilters, counts);
  const awaitingOnly = listed.length === 1 && listed[0] === 'awaiting-invoice';
  return (
    <PageLayout title="Invoicing" description="Stamp invoice numbers and review invoiced Jobs." size="full">
      <JobStageQuickFilters
        label="Invoicing stages"
        stages={awaitingStages}
        allStages={invoicingStages}
        summary={queues.data}
        columnFilters={tableController.columnFilters}
        onColumnFiltersChange={tableController.setColumnFilters}
      />
      <DataTable
        emptyMessage={awaitingOnly ? 'Nothing is waiting for an invoice.' : 'No Jobs found.'}
        errorMessage={
          getApiQueryErrorMessage(jobsQuery.error, 'Unable to load Invoicing.') ??
          getApiQueryErrorMessage(queues.error, 'Unable to load Invoicing counts.')
        }
        getRowAriaLabel={(job) => `Open ${job.jobNumber}`}
        globalFilterPlaceholder="Search Jobs…"
        isLoading={jobsQuery.isPending}
        paginationMode="cursor"
        loadMore={{
          hasNextPage: jobsQuery.hasNextPage,
          isFetchingNextPage: jobsQuery.isFetchingNextPage,
          loadedCount: jobs.length,
          onLoadMore: () => void jobsQuery.fetchNextPage(),
        }}
        onRowClick={(job) => void navigate({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } })}
        table={table}
        total={total}
        totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'Job' : 'Jobs'}`}
      />
      <JobCardPreviewSheet job={previewing} variant="customer" onClose={() => setPreviewing(null)} />
      {stamping ? (
        <StampInvoiceDialog
          job={stamping}
          open
          onOpenChange={(open) => {
            if (!open) setStamping(null);
          }}
        />
      ) : null}
    </PageLayout>
  );
}
