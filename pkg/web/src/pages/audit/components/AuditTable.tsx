import { AuditEntityType, type AuditEvent, type AuditListInput, AuditSortBy } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { EyeIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { formatAuditChangesJson, getAuditChangeDisplays } from './audit-change-display.js';

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
  job_stage_station: 'Station booking',
  product: 'Product',
  product_option: 'Product option',
  quote: 'Quote',
  station: 'Station',
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
  'max-h-44 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground';

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
  allowedSortIds: AuditSortBy.options,
  defaultSort: {
    desc: true,
    id: 'occurredAt',
  },
};

export const AuditTable: React.FC = () => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: useAuditTableStore,
    sortOptions: auditSortOptions,
    getListInputExtras: getAuditListInputExtras,
  });

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
    trpc.audit.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const { items: auditEvents, total, isLoading } = usePagedQueryResult<AuditTableEvent>(auditQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
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
        cell: ({ row }) => <span className="block truncate text-muted-foreground">{row.original.summary}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Summary',
        meta: {
          cellClassName: 'max-w-[28rem]',
          headerClassName: 'w-[28rem]',
        },
      },
      {
        accessorKey: 'changes',
        cell: ({ row }) => <ChangesCell changes={row.original.changes} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Changes',
        meta: {
          cellClassName: 'max-w-[42rem]',
          headerClassName: 'w-[42rem]',
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

function getAuditListInputExtras(columnFilters: ColumnFiltersState) {
  const occurredAtRange = getDateRangeFilterValue(columnFilters, 'occurredAt');
  const occurredAtStart = occurredAtRange.start ? toLocalDayStartIso(occurredAtRange.start) : undefined;
  const occurredAtEnd = occurredAtRange.end ? toLocalDayEndIso(occurredAtRange.end) : undefined;

  return {
    filters: {
      actorUserIds: getMultiSelectFilterValue(columnFilters, 'actorUserId'),
      entityIds: [],
      entityTypes: getEntityTypeFilterValue(columnFilters),
      ...(occurredAtStart ? { occurredAtStart } : {}),
      ...(occurredAtEnd ? { occurredAtEnd } : {}),
    },
  } satisfies Pick<AuditListInput, 'filters'>;
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

  const displays = getAuditChangeDisplays(changes);
  const previewDisplays = displays.slice(0, 2);
  const hiddenCount = displays.length - previewDisplays.length;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {previewDisplays.map((display) => (
          <span
            className="max-w-72 shrink-0 truncate rounded-md border border-border/70 bg-muted/30 px-1.5 py-0.5 text-xs text-muted-foreground"
            key={display.key}
            title={`${display.field}: ${display.from} -> ${display.to}`}
          >
            <AuditChangePreviewText display={display} />
          </span>
        ))}
        {hiddenCount > 0 ? (
          <Badge className="shrink-0 text-muted-foreground" variant="outline">
            +{hiddenCount}
          </Badge>
        ) : null}
      </div>
      <AuditChangesDetails changes={changes} displays={displays} />
    </div>
  );
};

type AuditChangePreviewTextProps = {
  display: ReturnType<typeof getAuditChangeDisplays>[number];
};

const AuditChangePreviewText: React.FC<AuditChangePreviewTextProps> = ({ display }) => {
  const [label, value] = display.preview.split(/:(.*)/s);

  if (!value) {
    return <span className="font-medium text-foreground">{display.preview}</span>;
  }

  return (
    <>
      <span className="font-medium text-foreground">{label}:</span>
      {value}
    </>
  );
};

type AuditChangesDetailsProps = {
  changes: NonNullable<AuditTableEvent['changes']>;
  displays: ReturnType<typeof getAuditChangeDisplays>;
};

const AuditChangesDetails: React.FC<AuditChangesDetailsProps> = ({ changes, displays }) => (
  <Popover>
    <PopoverTrigger render={<Button aria-label="View audit changes" size="icon-xs" variant="ghost" />}>
      <EyeIcon />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(42rem,calc(100vw-2rem))] gap-3 p-3">
      <PopoverHeader>
        <PopoverTitle>Change details</PopoverTitle>
      </PopoverHeader>

      <ScrollArea className="max-h-80">
        <div className="min-w-136 space-y-3 pr-3">
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              <div className="px-2 py-1.5">Field</div>
              <div className="px-2 py-1.5">From</div>
              <div className="px-2 py-1.5">To</div>
            </div>
            {displays.map((display) => (
              <div
                className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] border-b text-xs last:border-b-0"
                key={display.key}
              >
                <div className="px-2 py-1.5 font-medium text-foreground">{display.field}</div>
                <div className="min-w-0 wrap-break-word px-2 py-1.5 text-muted-foreground">{display.from}</div>
                <div className="min-w-0 wrap-break-word px-2 py-1.5 text-muted-foreground">{display.to}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Raw JSON</div>
            <pre className={auditChangesRawJsonClassName}>{formatAuditChangesJson(changes)}</pre>
          </div>
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
);

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
