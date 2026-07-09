import { AuditEntityType, type AuditEvent, type AuditListInput, AuditSortBy } from '@pkg/schema';
import { IconEye } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore, type DataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useUserOptions } from '@/hooks/options/index.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { type AuditChangeMap, formatAuditChangesJson, getAuditChangeDisplays } from './audit-change-display.js';
import { type AuditTableFixedFilters, getAuditListInputExtras } from './audit-table-input.js';

type AuditEventRow = Omit<AuditEvent, 'changes'> & {
  changes: AuditChangeMap | null;
};

type AuditTableStoreHook = UseBoundStore<StoreApi<DataTableStore>>;

type AuditTableProps = {
  emptyMessage?: string;
  fixedFilters?: AuditTableFixedFilters;
  showEntityTypeFilter?: boolean;
  store: AuditTableStoreHook;
};

const auditEntityTypeLabels = {
  customer: 'Customer',
  document: 'Document',
  job: 'Job',
  job_bay: 'Bay',
  part: 'Part',
  product: 'Product',
  quote: 'Quote',
  supplier: 'Supplier',
  user: 'User',
} as const satisfies Record<(typeof AuditEntityType.options)[number], string>;

const auditActionLabels = {
  created: 'Created',
  deleted: 'Deleted',
  updated: 'Updated',
} as const satisfies Record<AuditEvent['action'], string>;

const auditActionColorClassNames = {
  created: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
  deleted: 'border-red-500/50 bg-red-500/15 text-red-800 dark:text-red-200',
  updated: 'border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200',
} as const satisfies Record<AuditEvent['action'], string>;

const auditChangesRawJsonClassName =
  'max-h-52 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground';

const auditEntityTypeOptions = AuditEntityType.options.map((entityType) => ({
  label: auditEntityTypeLabels[entityType],
  value: entityType,
}));

const auditTableInitialState = {
  sorting: [
    {
      desc: true,
      id: 'occurredAt',
    },
  ],
};

export const useAuditTableStore = createPersistedDataTableStore({
  initialState: auditTableInitialState,
  persistName: 'audit-table',
});

export const useQuoteAuditTableStore = createPersistedDataTableStore({
  initialState: auditTableInitialState,
  persistName: 'quote-audit-table',
});

export const useProductAuditTableStore = createPersistedDataTableStore({
  initialState: auditTableInitialState,
  persistName: 'product-audit-table',
});

export const useCustomerAuditTableStore = createPersistedDataTableStore({
  initialState: auditTableInitialState,
  persistName: 'customer-audit-table',
});

export const useSupplierAuditTableStore = createPersistedDataTableStore({
  initialState: auditTableInitialState,
  persistName: 'supplier-audit-table',
});

const auditSortOptions: SortOptions<AuditListInput> = {
  allowedSortIds: AuditSortBy.options,
  defaultSort: {
    desc: true,
    id: 'occurredAt',
  },
};

export const AuditTable: React.FC<AuditTableProps> = ({
  emptyMessage = 'No audit events found.',
  fixedFilters,
  showEntityTypeFilter = true,
  store,
}) => {
  const trpc = useTRPC();

  const getListInputExtras = useCallback(
    (columnFilters: Parameters<typeof getAuditListInputExtras>[0]) =>
      getAuditListInputExtras(columnFilters, fixedFilters),
    [fixedFilters],
  );

  const tableController = useServerSideTableController({
    store,
    sortOptions: auditSortOptions,
    getListInputExtras,
  });

  const userOptions = useUserOptions();

  const auditQuery = useQuery(
    trpc.audit.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const { items: auditEvents, total, isLoading } = usePagedQueryResult<AuditEventRow>(auditQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: auditSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<AuditEventRow>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        cell: ({ row }) => <DateDisplay date={row.original.occurredAt} format="medium" />,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Occurred',
        meta: {
          filterVariant: 'date-range',
          headerClassName: 'w-44 min-w-44',
        },
      },
      {
        accessorKey: 'actorUserId',
        cell: ({ row }) => <ActorCell event={row.original} />,
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Actor',
        meta: {
          filterOptions: userOptions.selectOptions,
          filterVariant: 'multi-select',
          headerClassName: 'w-64 min-w-64',
        },
      },
      ...(showEntityTypeFilter
        ? [
            {
              accessorKey: 'entityType',
              cell: ({ row }) => (
                <span className="text-muted-foreground">{auditEntityTypeLabels[row.original.entityType]}</span>
              ),
              enableColumnFilter: true,
              enableSorting: false,
              header: 'Entity',
              meta: {
                filterOptions: auditEntityTypeOptions,
                filterVariant: 'multi-select',
                headerClassName: 'w-44 min-w-44',
              },
            } satisfies ColumnDef<AuditEventRow>,
          ]
        : []),
      {
        accessorKey: 'action',
        cell: ({ row }) => <AuditActionBadge action={row.original.action} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Action',
        meta: {
          headerClassName: 'w-32 min-w-32',
        },
      },
      {
        accessorKey: 'summary',
        cell: ({ row }) => <span className="block truncate text-muted-foreground">{row.original.summary}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Summary',
        meta: {
          cellClassName: 'min-w-0',
        },
      },
      {
        cell: ({ row }) => <AuditDetailsCell changes={row.original.changes} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: '',
        id: 'details',
        meta: {
          cellClassName: 'text-right',
          headerClassName: 'w-12 min-w-12',
        },
      },
    ],
    [showEntityTypeFilter, userOptions.selectOptions],
  );

  const table = useReactTable<AuditEventRow>({
    columns,
    data: auditEvents,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onPaginationChange: tableController.setPagination,
    onSortingChange: tableController.setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      columnFilters: tableController.columnFilters,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  return (
    <DataTable
      emptyMessage={emptyMessage}
      errorMessage={getApiQueryErrorMessage(auditQuery.error, 'Unable to load audit events.')}
      hideGlobalFilter
      isLoading={isLoading}
      tableClassName="table-fixed"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'event' : 'events'}`}
    />
  );
};

type ActorCellProps = {
  event: AuditEventRow;
};

const ActorCell: React.FC<ActorCellProps> = ({ event }) => {
  if (!event.actorUserId) {
    return <span className="text-muted-foreground">System</span>;
  }

  const actorLabel = event.actorName || event.actorEmail || event.actorUserId;

  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{actorLabel}</div>
    </div>
  );
};

type AuditActionBadgeProps = {
  action: AuditEvent['action'];
};

const AuditActionBadge: React.FC<AuditActionBadgeProps> = ({ action }) => (
  <Badge className={cn(auditActionColorClassNames[action])} variant="outline">
    {auditActionLabels[action]}
  </Badge>
);

type ChangesCellProps = {
  changes: AuditEventRow['changes'];
};

const AuditDetailsCell: React.FC<ChangesCellProps> = ({ changes }) => {
  if (!changes) {
    return (
      <Button aria-label="No audit changes recorded" disabled size="icon-xs" variant="ghost">
        <IconEye />
      </Button>
    );
  }

  const displays = getAuditChangeDisplays(changes);

  return <AuditChangesDetails changes={changes} displays={displays} />;
};

type AuditChangesDetailsProps = {
  changes: NonNullable<AuditEventRow['changes']>;
  displays: ReturnType<typeof getAuditChangeDisplays>;
};

const AuditChangesDetails: React.FC<AuditChangesDetailsProps> = ({ changes, displays }) => (
  <Dialog>
    <Tooltip>
      <TooltipTrigger
        render={<DialogTrigger render={<Button aria-label="View audit changes" size="icon-xs" variant="ghost" />} />}
      >
        <IconEye />
      </TooltipTrigger>
      <TooltipContent>View audit changes</TooltipContent>
    </Tooltip>
    <DialogContent className="max-h-[calc(100vh-2rem)] gap-3 overflow-hidden sm:max-w-[860px]">
      <DialogHeader>
        <DialogTitle>Change details</DialogTitle>
      </DialogHeader>

      <ScrollArea className="max-h-[calc(100vh-8rem)] min-h-0">
        <div className="space-y-3 pr-3">
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              <div className="px-2 py-1.5">Field</div>
              <div className="px-2 py-1.5">From</div>
              <div className="px-2 py-1.5">To</div>
            </div>
            {displays.map((display) => (
              <div
                className="grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] border-b text-xs last:border-b-0"
                key={display.key}
              >
                <div className="px-2 py-1.5 font-medium text-foreground">{display.field}</div>
                <div className="min-w-0 whitespace-pre-wrap wrap-break-word px-2 py-1.5 text-muted-foreground">
                  {display.from}
                </div>
                <div className="min-w-0 whitespace-pre-wrap wrap-break-word px-2 py-1.5 text-muted-foreground">
                  {display.to}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Raw JSON</div>
            <pre className={auditChangesRawJsonClassName}>{formatAuditChangesJson(changes)}</pre>
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);
