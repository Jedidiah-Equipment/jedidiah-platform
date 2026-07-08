import { formatCurrency } from '@pkg/domain';
import { type Product, type ProductListInput, ProductSortBy, type UUID } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ColumnFiltersState,
  functionalUpdate,
  getCoreRowModel,
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { useProductRangeVariantOptions } from '@/hooks/options/index.js';
import { useProductRangeOptions } from '@/hooks/options/use-product-range-options.js';
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
  persistVersion: 2,
});

const productSortOptions: SortOptions<ProductListInput> = {
  allowedSortIds: ProductSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

export const ProductTable: React.FC<ProductTableProps> = ({ onEditProduct }) => {
  const trpc = useTRPC();
  const productRangeOptions = useProductRangeOptions();

  const tableController = useServerSideTableController({
    store: useProductTableStore,
    sortOptions: productSortOptions,
    getListInputExtras: getProductListInputExtras,
  });
  const selectedRangeId = getColumnFilterValue(tableController.columnFilters, 'rangeName') ?? '';
  const productRangeVariantOptions = useProductRangeVariantOptions(selectedRangeId as UUID | '');

  useEffect(() => {
    if (selectedRangeId || !getColumnFilterValue(tableController.columnFilters, 'variantName')) {
      return;
    }

    tableController.setColumnFilters((currentFilters) => normalizeProductColumnFilters(currentFilters, currentFilters));
  }, [selectedRangeId, tableController.columnFilters, tableController.setColumnFilters]);

  const setProductColumnFilters = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      tableController.setColumnFilters((currentFilters) =>
        normalizeProductColumnFilters(functionalUpdate(updater, currentFilters), currentFilters),
      );
    },
    [tableController.setColumnFilters],
  );

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
        accessorFn: (product) => product.range.name,
        cell: ({ row }) => <span>{row.original.range.name}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Range',
        id: 'rangeName',
        meta: {
          filterOptions: productRangeOptions.selectOptions,
          filterVariant: 'select',
          headerClassName: 'min-w-36',
        },
      },
      {
        accessorFn: (product) => product.variant?.name ?? '',
        cell: ({ row }) => <span>{row.original.variant?.name ?? ''}</span>,
        enableColumnFilter: Boolean(selectedRangeId),
        enableSorting: true,
        header: 'Variant',
        id: 'variantName',
        meta: {
          filterOptions: productRangeVariantOptions.selectOptions,
          filterVariant: 'select',
          headerClassName: 'min-w-36',
        },
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
        enableSorting: true,
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
  }, [productRangeOptions.selectOptions, productRangeVariantOptions.selectOptions, selectedRangeId]);

  const table = useReactTable({
    columns,
    data: products,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: setProductColumnFilters,
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
  const rangeId = getColumnFilterValue(columnFilters, 'rangeName');

  return {
    columnFilters: {
      modelCode: getColumnFilterValue(columnFilters, 'modelCode'),
      name: getColumnFilterValue(columnFilters, 'name'),
      rangeId,
      variantId: rangeId ? getColumnFilterValue(columnFilters, 'variantName') : undefined,
    },
  } satisfies Pick<ProductListInput, 'columnFilters'>;
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'modelCode' | 'name' | 'rangeName' | 'variantName',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function normalizeProductColumnFilters(
  nextFilters: ColumnFiltersState,
  previousFilters: ColumnFiltersState,
): ColumnFiltersState {
  const previousRangeId = getColumnFilterValue(previousFilters, 'rangeName');
  const nextRangeId = getColumnFilterValue(nextFilters, 'rangeName');

  // Variant filters are scoped by Range; clearing them here prevents persisted or in-flight table state
  // from expressing an impossible Range/Variant pair.
  if (!nextRangeId || previousRangeId !== nextRangeId) {
    return nextFilters.filter((filter) => filter.id !== 'variantName');
  }

  return nextFilters;
}
