import { type Supplier, type SupplierListInput, SupplierSortBy } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { CopyValueButton } from '@/components/button/CopyValueButton.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/equipment/components/thumbnail/EntityThumbnail.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

type SupplierTableProps = {
  onEditSupplier: ((supplier: Supplier) => void) | undefined;
};

export const useSupplierTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'companyName',
        desc: false,
      },
    ],
  },
  persistName: 'suppliers-table',
});

const supplierSortOptions: SortOptions<SupplierListInput> = {
  allowedSortIds: SupplierSortBy.options,
  defaultSort: {
    id: 'companyName',
  },
};

export const SupplierTable: React.FC<SupplierTableProps> = ({ onEditSupplier }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: useSupplierTableStore,
    sortOptions: supplierSortOptions,
    getListInputExtras: getSupplierListInputExtras,
  });

  const suppliersQuery = useInfiniteQuery(
    trpc.suppliers.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: suppliers, total } = useCombinedCursorQueryPages(suppliersQuery.data?.pages);

  const columns = useMemo<DataTableColumnDef<Supplier>[]>(() => {
    const tableColumns: DataTableColumnDef<Supplier>[] = [
      {
        accessorKey: 'companyName',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            <EntityThumbnail
              label={row.original.companyName}
              size="sm"
              thumbnailDataUrl={row.original.thumbnailDataUrl}
            />
            {row.original.companyName}
          </span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Company',
      },
      {
        accessorKey: 'email',
        cell: ({ row }) =>
          row.original.email ? (
            <span className="flex min-w-0 items-center gap-1 text-sm">
              <span className="min-w-0 truncate">{row.original.email}</span>
              <CopyValueButton label="Copy supplier email" value={row.original.email} />
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Email',
      },
      {
        accessorKey: 'contactPerson',
        cell: ({ row }) => row.original.contactPerson ?? <span className="text-muted-foreground">None</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Contact',
      },
      {
        accessorKey: 'phone',
        cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">None</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Phone',
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
      },
    ];

    return tableColumns;
  }, []);

  const table = useDataTable({
    columns,
    data: suppliers,
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

  return (
    <DataTable
      emptyMessage="No suppliers found."
      errorMessage={getApiQueryErrorMessage(suppliersQuery.error, 'Unable to load suppliers.')}
      getRowAriaLabel={onEditSupplier ? (supplier) => `Edit ${supplier.companyName}` : undefined}
      globalFilterPlaceholder="Search suppliers..."
      isLoading={suppliersQuery.isPending}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: suppliersQuery.hasNextPage,
        isFetchingNextPage: suppliersQuery.isFetchingNextPage,
        loadedCount: suppliers.length,
        onLoadMore: () => void suppliersQuery.fetchNextPage(),
      }}
      onRowClick={onEditSupplier}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'supplier' : 'suppliers'}`}
    />
  );
};

function getSupplierListInputExtras(columnFilters: ColumnFiltersState) {
  return {
    columnFilters: {
      companyName: getColumnFilterValue(columnFilters, 'companyName'),
      email: getColumnFilterValue(columnFilters, 'email'),
      id: getColumnFilterValue(columnFilters, 'id'),
    },
  } satisfies Pick<SupplierListInput, 'columnFilters'>;
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'companyName' | 'email' | 'id',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
