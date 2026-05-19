import { AuditEntityType, type AuditEvent, type AuditListInput } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { DateDisplay } from '@/components/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { getPrimarySort, type SortOptions } from '@/components/data-table/table-state.js';
import { Badge } from '@/components/ui/badge.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

type DateRangeFilterValue = {
  end?: string;
  start?: string;
};

type AuditTableEvent = Omit<AuditEvent, 'changes'> & {
  changes: Record<string, { from?: unknown; to?: unknown }> | null;
};

const auditEntityTypeLabels = {
  customer: 'Customer',
  job: 'Job',
  job_stage: 'Job stage',
  product: 'Product',
  product_option: 'Product option',
  quote: 'Quote',
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

const auditEntityTypeOptions = AuditEntityType.options.map((entityType) => ({
  label: auditEntityTypeLabels[entityType],
  value: entityType,
}));

export const useAuditTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        desc: true,
        id: 'occurredAt',
      },
    ],
  },
  persistName: 'audit-table',
});

const auditSortOptions: SortOptions<AuditListInput> = {
  allowedSortIds: ['occurredAt'],
  defaultSort: {
    desc: true,
    id: 'occurredAt',
  },
};

export const AuditTable: React.FC = () => {
  const trpc = useTRPC();
  const auditListInput = useAuditListInput();
  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const actorFilterOptions = useMemo(
    () =>
      usersQuery.data?.users.map((user) => ({
        label: user.name === user.email ? user.email : `${user.name} (${user.email})`,
        value: user.id,
      })) ?? [],
    [usersQuery.data?.users],
  );

  const auditQuery = useQuery(
    trpc.audit.list.queryOptions(auditListInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const { items: auditEvents, total, isLoading } = usePagedQueryResult<AuditTableEvent>(auditQuery);

  const { columnFilters, pagination, setColumnFilters, setPageIndex, setPagination, setSorting, sorting } =
    useAuditTableStore(
      useShallow((state) => ({
        columnFilters: state.columnFilters,
        pagination: state.pagination,
        setColumnFilters: state.setColumnFilters,
        setPageIndex: state.setPageIndex,
        setPagination: state.setPagination,
        setSorting: state.setSorting,
        sorting: state.sorting,
      })),
    );
  const tableState = useConstrainedTableState({
    pagination,
    setPageIndex,
    sorting,
    sortOptions: auditSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<AuditTableEvent>[]>(
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
          filterOptions: actorFilterOptions,
          filterVariant: 'multi-select',
          headerClassName: 'w-64 min-w-64',
        },
      },
      {
        accessorKey: 'entityType',
        cell: ({ row }) => <Badge variant="outline">{auditEntityTypeLabels[row.original.entityType]}</Badge>,
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Entity',
        meta: {
          filterOptions: auditEntityTypeOptions,
          filterVariant: 'multi-select',
          headerClassName: 'w-44 min-w-44',
        },
      },
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
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.summary}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Summary',
      },
      {
        accessorKey: 'changes',
        cell: ({ row }) => <ChangesCell changes={row.original.changes} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Changes',
        meta: {
          cellClassName: 'max-w-80',
          headerClassName: 'w-80',
        },
      },
    ],
    [actorFilterOptions],
  );

  const table = useReactTable<AuditTableEvent>({
    columns,
    data: auditEvents,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      columnFilters,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  return (
    <DataTable
      emptyMessage="No audit events found."
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

function useAuditListInput() {
  const { columnFilters, pagination, sorting } = useAuditTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      pagination: state.pagination,
      sorting: state.sorting,
    })),
  );
  const sort = getPrimarySort(sorting, auditSortOptions);

  return useMemo(() => {
    const occurredAtRange = getDateRangeFilterValue(columnFilters, 'occurredAt');
    const occurredAtStart = occurredAtRange.start ? toLocalDayStartIso(occurredAtRange.start) : undefined;
    const occurredAtEnd = occurredAtRange.end ? toLocalDayEndIso(occurredAtRange.end) : undefined;
    const sortDirection = sort.desc ? ('desc' as const) : ('asc' as const);

    return {
      filters: {
        actorUserIds: getMultiSelectFilterValue(columnFilters, 'actorUserId'),
        entityTypes: getEntityTypeFilterValue(columnFilters),
        ...(occurredAtStart ? { occurredAtStart } : {}),
        ...(occurredAtEnd ? { occurredAtEnd } : {}),
      },
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      sortBy: sort.id,
      sortDirection,
    };
  }, [columnFilters, pagination.pageIndex, pagination.pageSize, sort.desc, sort.id]);
}

type ActorCellProps = {
  event: AuditTableEvent;
};

const ActorCell: React.FC<ActorCellProps> = ({ event }) => {
  if (!event.actorUserId) {
    return <span className="text-muted-foreground">System</span>;
  }

  const actorLabel = event.actorName || event.actorEmail || event.actorUserId;

  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{actorLabel}</div>
      {event.actorEmail && event.actorEmail !== actorLabel ? (
        <div className="truncate text-xs text-muted-foreground">{event.actorEmail}</div>
      ) : null}
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
  changes: AuditTableEvent['changes'];
};

const ChangesCell: React.FC<ChangesCellProps> = ({ changes }) => {
  if (!changes) {
    return <span className="text-muted-foreground">None</span>;
  }

  return <code className="block truncate font-mono text-xs text-muted-foreground">{JSON.stringify(changes)}</code>;
};

function getMultiSelectFilterValue(columnFilters: ColumnFiltersState, id: 'actorUserId' | 'entityType'): string[] {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function getEntityTypeFilterValue(columnFilters: ColumnFiltersState): AuditListInput['filters']['entityTypes'] {
  const allowedEntityTypes = new Set<string>(AuditEntityType.options);

  return getMultiSelectFilterValue(columnFilters, 'entityType').filter((entityType) =>
    allowedEntityTypes.has(entityType),
  ) as AuditListInput['filters']['entityTypes'];
}

function getDateRangeFilterValue(columnFilters: ColumnFiltersState, id: 'occurredAt'): DateRangeFilterValue {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const range = value as { end?: unknown; start?: unknown };

  return {
    ...(typeof range.end === 'string' && range.end ? { end: range.end } : {}),
    ...(typeof range.start === 'string' && range.start ? { start: range.start } : {}),
  };
}

function toLocalDayStartIso(value: string): string | undefined {
  const dateParts = parseDateInput(value);

  if (!dateParts) {
    return undefined;
  }

  const [year, month, day] = dateParts;

  return toIsoString(new Date(year, month - 1, day, 0, 0, 0, 0));
}

function toLocalDayEndIso(value: string): string | undefined {
  const dateParts = parseDateInput(value);

  if (!dateParts) {
    return undefined;
  }

  const [year, month, day] = dateParts;

  return toIsoString(new Date(year, month - 1, day, 23, 59, 59, 999));
}

function parseDateInput(value: string): [number, number, number] | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));

  if (!year || !month || !day) {
    return undefined;
  }

  return [year, month, day];
}

function toIsoString(date: Date): string | undefined {
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
