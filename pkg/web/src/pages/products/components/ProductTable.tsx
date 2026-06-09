import { formatCurrency } from '@pkg/domain';
import { type Product, type ProductListInput, ProductSortBy } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
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

type ProductTableProps = {
  onEditProduct: ((product: Product) => void) | undefined;
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
  allowedSortIds: ProductSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

export const ProductTable: React.FC<ProductTableProps> = ({ onEditProduct }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: useProductTableStore,
    sortOptions: productSortOptions,
    getListInputExtras: getProductListInputExtras,
  });

  const productsQuery = useQuery(
    trpc.products.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );

  const { items: products, total, isLoading } = usePagedQueryResult(productsQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: productSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<Product>[]>(() => {
    const tableColumns: ColumnDef<Product>[] = [
      {
        accessorKey: 'name',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            <EntityThumbnail
              label={row.original.modelCode || row.original.name}
              size="sm"
              thumbnailDataUrl={row.original.thumbnailDataUrl}
            />
            {row.original.name}
          </span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Name',
      },
      {
        accessorKey: 'modelCode',
        cell: ({ row }) => <span className="font-mono">{row.original.modelCode}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Model code',
      },
      {
        accessorKey: 'basePrice',
        cell: ({ row }) => formatCurrency(row.original.basePrice, row.original.currencyCode),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Base price',
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
      },
      {
        accessorKey: 'updatedAt',
        cell: ({ row }) => <DateDisplay date={row.original.updatedAt} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Updated',
      },
      {
        accessorKey: 'description',
        cell: ({ row }) => (
          <span className="block max-w-[320px] truncate text-sm text-muted-foreground">
            {row.original.description ?? '-'}
          </span>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Summary',
      },
    ];

    return tableColumns;
  }, []);

  const table = useReactTable({
    columns,
    data: products,
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
      emptyMessage="No products found."
      errorMessage={getApiQueryErrorMessage(productsQuery.error, 'Unable to load products.')}
      getRowAriaLabel={onEditProduct ? (product) => `Edit ${product.name}` : undefined}
      globalFilterPlaceholder="Search products..."
      isLoading={isLoading}
      onRowClick={onEditProduct}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'product' : 'products'}`}
    />
  );
};

function getProductListInputExtras(columnFilters: ColumnFiltersState) {
  return {
    columnFilters: {
      modelCode: getColumnFilterValue(columnFilters, 'modelCode'),
      name: getColumnFilterValue(columnFilters, 'name'),
    },
  } satisfies Pick<ProductListInput, 'columnFilters'>;
}

function getColumnFilterValue(columnFilters: ColumnFiltersState, id: 'modelCode' | 'name'): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
