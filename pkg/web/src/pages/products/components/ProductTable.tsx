import type { Product, ProductListInput } from '@pkg/schema';
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
import { useTRPC } from '@/lib/trpc.js';

type ProductTableProps = {
  onEditProduct: ((product: Product) => void) | undefined;
  showEditActions: boolean;
};

export const useProductTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'name',
        desc: false,
      },
    ],
  },
  persistName: 'products-table',
});

const productSortOptions: SortOptions<ProductListInput> = {
  allowedSortIds: ['basePrice', 'createdAt', 'id', 'modelCode', 'name'],
  defaultSort: {
    id: 'name',
  },
};

export const ProductTable: React.FC<ProductTableProps> = ({ onEditProduct, showEditActions }) => {
  const trpc = useTRPC();
  const productListInput = useProductListInput();

  const productsQuery = useQuery(
    trpc.products.list.queryOptions(productListInput, {
      placeholderData: keepPreviousData,
    }),
  );

  const { items: products, total, isLoading } = usePagedQueryResult(productsQuery);

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
  } = useProductTableStore(
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
    sortOptions: productSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<Product>[]>(() => {
    const tableColumns: ColumnDef<Product>[] = [
      {
        accessorKey: 'name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Name',
      },
      {
        accessorKey: 'modelCode',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.modelCode}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Model code',
      },
      {
        accessorKey: 'basePrice',
        cell: ({ row }) => formatProductPrice(row.original),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Base price',
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => formatProductDate(row.original.createdAt),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
      },
      {
        accessorKey: 'updatedAt',
        cell: ({ row }) => formatProductDate(row.original.updatedAt),
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Updated',
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
    ];

    if (showEditActions && onEditProduct) {
      tableColumns.push({
        id: 'actions',
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEditProduct?.(row.original)}
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
      });
    }

    return tableColumns;
  }, [onEditProduct, showEditActions]);

  const table = useReactTable({
    columns,
    data: products,
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
      emptyMessage="No products found."
      errorMessage={productsQuery.error?.message}
      globalFilterPlaceholder="Search products..."
      isLoading={isLoading}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'product' : 'products'}`}
    />
  );
};

export function useProductListInput(): ProductListInput {
  const { columnFilters, globalFilter, pagination, sorting } = useProductTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      sorting: state.sorting,
    })),
  );
  const sort = getPrimarySort(sorting, productSortOptions);

  return useMemo(
    () =>
      ({
        columnFilters: {
          id: getColumnFilterValue(columnFilters, 'id'),
          modelCode: getColumnFilterValue(columnFilters, 'modelCode'),
          name: getColumnFilterValue(columnFilters, 'name'),
        },
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: globalFilter,
        sortBy: sort.id,
        sortDirection: sort.desc ? 'desc' : 'asc',
      }) satisfies ProductListInput,
    [columnFilters, globalFilter, pagination.pageIndex, pagination.pageSize, sort.desc, sort.id],
  );
}

function getColumnFilterValue(columnFilters: ColumnFiltersState, id: 'id' | 'modelCode' | 'name'): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function formatProductPrice(product: Product): string {
  return new Intl.NumberFormat('en-ZA', {
    currency: product.currencyCode,
    style: 'currency',
  }).format(product.basePrice);
}

function formatProductDate(value: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
  }).format(new Date(value));
}
