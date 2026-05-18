import type { Customer, CustomerListInput } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { getPrimarySort, type SortOptions } from '@/components/data-table/table-state.js';
import { Button } from '@/components/ui/button.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';

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
  allowedSortIds: ['companyName', 'createdAt', 'email', 'id'],
  defaultSort: {
    id: 'companyName',
  },
};

export const CustomerTable: React.FC<CustomerTableProps> = ({ onEditCustomer }) => {
  const trpc = useTRPC();
  const customerListInput = useCustomerListInput();

  const customersQuery = useQuery(
    trpc.customers.list.queryOptions(customerListInput, {
      placeholderData: keepPreviousData,
    }),
  );

  const { items: customers, total, isLoading } = usePagedQueryResult(customersQuery);

  const {
    columnFilters,
    globalFilter,
    pagination,
    setColumnFilters,
    setGlobalFilter,
    setPageIndex,
    setPagination,
    setSorting,
    sorting,
  } = useCustomerTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
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
    sortOptions: customerSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      {
        accessorKey: 'companyName',
        cell: ({ row }) => <span className="font-medium">{row.original.companyName}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Company',
      },
      {
        accessorKey: 'email',
        cell: ({ row }) => <span className="text-sm">{row.original.email}</span>,
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
        cell: ({ row }) => formatDate(row.original.createdAt),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
      },
      {
        accessorKey: 'id',
        cell: ({ row }) => (
          <span className="block max-w-[240px] truncate font-mono text-xs text-muted-foreground">
            {row.original.id}
          </span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'ID',
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.companyName}`}
              onClick={() => onEditCustomer(row.original)}
              size="icon-sm"
              variant="outline"
            >
              <PencilIcon />
            </Button>
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: {
          cellClassName: 'text-right',
          headerClassName: 'w-20 text-right',
        },
      },
    ],
    [onEditCustomer],
  );

  const table = useReactTable({
    columns,
    data: customers,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    pageCount: tableState.pageCount,
    rowCount: total,
    state: {
      columnFilters,
      globalFilter,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  return (
    <DataTable
      emptyMessage="No customers found."
      errorMessage={getApiQueryErrorMessage(customersQuery.error, 'Unable to load customers.')}
      globalFilterPlaceholder="Search customers..."
      isLoading={isLoading}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'customer' : 'customers'}`}
    />
  );
};

export function useCustomerListInput(): CustomerListInput {
  const { columnFilters, globalFilter, pagination, sorting } = useCustomerTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      sorting: state.sorting,
    })),
  );
  const sort = getPrimarySort(sorting, customerSortOptions);

  return useMemo(
    () =>
      ({
        columnFilters: {
          companyName: getColumnFilterValue(columnFilters, 'companyName'),
          email: getColumnFilterValue(columnFilters, 'email'),
          id: getColumnFilterValue(columnFilters, 'id'),
        },
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: globalFilter,
        sortBy: sort.id,
        sortDirection: sort.desc ? 'desc' : 'asc',
      }) satisfies CustomerListInput,
    [columnFilters, globalFilter, pagination.pageIndex, pagination.pageSize, sort.desc, sort.id],
  );
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'companyName' | 'email' | 'id',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
