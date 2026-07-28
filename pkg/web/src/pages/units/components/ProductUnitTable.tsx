import {
  ProductUnitBuildState,
  type ProductUnitListInput,
  ProductUnitSortBy,
  type ProductUnitSummary,
} from '@pkg/schema';
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
import { toSelectOptions } from '@/hooks/options/helpers.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { buildStateLabels, ProductUnitBuildStateCell, ProductUnitOwnerCell } from './ProductUnitOwnerCell.js';

/** The machines we hold. Not a Customer, so it needs a filter value of its own. */
const STOCK_OWNER_VALUE = 'stock';

type ProductUnitTableProps = {
  onOpenUnit: (unit: ProductUnitSummary) => void;
};

export const useProductUnitTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [{ id: 'createdAt', desc: true }],
  },
  persistName: 'product-units-table',
});

const productUnitSortOptions: SortOptions<ProductUnitListInput> = {
  allowedSortIds: ProductUnitSortBy.options,
  defaultSort: { id: 'createdAt', desc: true },
};

export const ProductUnitTable: React.FC<ProductUnitTableProps> = ({ onOpenUnit }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: useProductUnitTableStore,
    sortOptions: productUnitSortOptions,
    getListInputExtras: getProductUnitListInputExtras,
  });

  const filterOptionsQuery = useQuery(trpc.productUnits.filterOptions.queryOptions());
  const unitsQuery = useQuery(
    trpc.productUnits.list.queryOptions(tableController.listInput, { placeholderData: keepPreviousData }),
  );

  const { items: units, total, isLoading } = usePagedQueryResult(unitsQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: productUnitSortOptions,
    total,
  });

  const ownerOptions = useMemo(
    () => [
      { label: 'Stock', value: STOCK_OWNER_VALUE },
      ...toSelectOptions(filterOptionsQuery.data?.owners ?? [], (owner) => owner.companyName),
    ],
    [filterOptionsQuery.data?.owners],
  );
  const productOptions = useMemo(
    () => toSelectOptions(filterOptionsQuery.data?.products ?? [], (product) => product.name),
    [filterOptionsQuery.data?.products],
  );

  const columns = useMemo<ColumnDef<ProductUnitSummary>[]>(
    () => [
      {
        accessorFn: (unit) => unit.productSerialNumber,
        cell: ({ row }) => (
          <span className="font-medium font-mono text-sm tabular-nums">{row.original.productSerialNumber}</span>
        ),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Serial',
        id: 'productSerialNumber',
        meta: { headerClassName: 'min-w-36' },
      },
      {
        accessorFn: (unit) => unit.product?.name,
        cell: ({ row }) =>
          row.original.product ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{row.original.product.name}</span>
              <span className="truncate text-muted-foreground text-xs">{row.original.product.modelCode}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Product',
        id: 'product',
        meta: { filterOptions: productOptions, filterVariant: 'select', headerClassName: 'min-w-48' },
      },
      {
        accessorFn: (unit) => unit.owner?.companyName,
        cell: ({ row }) => <ProductUnitOwnerCell owner={row.original.owner} />,
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Owner',
        id: 'owner',
        meta: { filterOptions: ownerOptions, filterVariant: 'select', headerClassName: 'min-w-44' },
      },
      {
        accessorFn: (unit) => unit.buildState,
        cell: ({ row }) => <ProductUnitBuildStateCell buildState={row.original.buildState} />,
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Build',
        id: 'buildState',
        meta: {
          filterOptions: ProductUnitBuildState.options.map((state) => ({
            label: buildStateLabels[state],
            value: state,
          })),
          filterVariant: 'select',
          headerClassName: 'min-w-32',
        },
      },
      {
        accessorFn: (unit) => unit.vinNumber,
        cell: ({ row }) => row.original.vinNumber ?? <span className="text-muted-foreground">—</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'VIN',
        id: 'vinNumber',
      },
      {
        accessorFn: (unit) => unit.createdAt,
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Created',
        id: 'createdAt',
      },
    ],
    [ownerOptions, productOptions],
  );

  const table = useReactTable({
    columns,
    data: units,
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
      emptyMessage="No units found."
      errorMessage={getApiQueryErrorMessage(unitsQuery.error, 'Unable to load units.')}
      getRowAriaLabel={(unit) => `Open unit ${unit.productSerialNumber}`}
      globalFilterPlaceholder="Search by serial number..."
      isLoading={isLoading}
      onRowClick={onOpenUnit}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'unit' : 'units'}`}
    />
  );
};

function getProductUnitListInputExtras(columnFilters: ColumnFiltersState) {
  const owner = getColumnFilterValue(columnFilters, 'owner');
  const buildState = getColumnFilterValue(columnFilters, 'buildState');

  return {
    columnFilters: {
      buildState: ProductUnitBuildState.safeParse(buildState).data,
      owner: owner === STOCK_OWNER_VALUE ? STOCK_OWNER_VALUE : owner,
      productId: getColumnFilterValue(columnFilters, 'product'),
    },
  } satisfies Pick<ProductUnitListInput, 'columnFilters'>;
}

function getColumnFilterValue(columnFilters: ColumnFiltersState, id: string): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
