import { type Customer, type CustomerListInput, CustomerSortBy } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { CopyValueButton } from '@/components/button/CopyValueButton.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

type CustomerTableProps = {
  onEditCustomer: (customer: Customer) => void;
};

export const useCustomerTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'companyName',
        desc: false,
      },
    ],
  },
  persistName: 'customers-table',
});

const customerSortOptions: SortOptions<CustomerListInput> = {
  allowedSortIds: CustomerSortBy.options,
  defaultSort: {
    id: 'companyName',
  },
};

export const CustomerTable: React.FC<CustomerTableProps> = ({ onEditCustomer }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: useCustomerTableStore,
    sortOptions: customerSortOptions,
    getListInputExtras: getCustomerListInputExtras,
  });

  const customersQuery = useQuery(
    trpc.customers.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );

  const { items: customers, total, isLoading } = usePagedQueryResult(customersQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: customerSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
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
        accessorKey: 'email',
        cell: ({ row }) =>
          row.original.email ? (
            <span className="flex min-w-0 items-center gap-1 text-sm">
              <span className="min-w-0 truncate">{row.original.email}</span>
              <CopyValueButton label="Copy customer email" value={row.original.email} />
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Email',
      },
      {
        accessorKey: 'vatNumber',
        cell: ({ row }) => row.original.vatNumber ?? <span className="text-muted-foreground">None</span>,
        enableColumnFilter: true,
        enableSorting: false,
        header: 'VAT number',
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: customers,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onPaginationChange: tableController.setPagination,
    onSortingChange: tableController.setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  return (
    <DataTable
      emptyMessage="No customers found."
      errorMessage={getApiQueryErrorMessage(customersQuery.error, 'Unable to load customers.')}
      getRowAriaLabel={(customer) => `Edit ${customer.companyName}`}
      globalFilterPlaceholder="Search customers..."
      isLoading={isLoading}
      onRowClick={onEditCustomer}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'customer' : 'customers'}`}
    />
  );
};

function getCustomerListInputExtras(columnFilters: ColumnFiltersState) {
  return {
    columnFilters: {
      companyName: getColumnFilterValue(columnFilters, 'companyName'),
      email: getColumnFilterValue(columnFilters, 'email'),
      id: getColumnFilterValue(columnFilters, 'id'),
      vatNumber: getColumnFilterValue(columnFilters, 'vatNumber'),
    },
  } satisfies Pick<CustomerListInput, 'columnFilters'>;
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'companyName' | 'email' | 'id' | 'vatNumber',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
