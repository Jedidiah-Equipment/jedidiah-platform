import { hasPermission, productUnitBuildStateLabels } from '@pkg/domain';
import {
  ProductUnitDisplayBuildState,
  type ProductUnitListInput,
  ProductUnitSortBy,
  type ProductUnitSummary,
} from '@pkg/schema';
import { IconDownload, IconLoader2 } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { toSelectOptions } from '@/hooks/options/helpers.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { downloadProductUnitStockExport } from '../product-unit-stock-export.js';
import { ProductUnitBuildStateCell } from './ProductUnitBuildStateCell.js';
import { ProductUnitOwnerCell } from './ProductUnitOwnerCell.js';

/** The Units we hold. Not a Customer, so it needs a filter value of its own. */
const STOCK_OWNER_VALUE = 'stock';

type ProductUnitTableProps = {
  onOpenUnit: (unit: ProductUnitSummary) => void;
  render?: ((view: { exportAction: React.ReactNode; tableContent: React.ReactNode }) => React.ReactNode) | undefined;
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

export const ProductUnitTable: React.FC<ProductUnitTableProps> = ({ onOpenUnit, render }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();

  const tableController = useServerSideTableController({
    store: useProductUnitTableStore,
    sortOptions: productUnitSortOptions,
    getListInputExtras: getProductUnitListInputExtras,
  });

  // One row crosses the ledger, the Unit, the Product's price and the sourcing Quote, so the button
  // mirrors the API's all-of gate rather than `product_unit:read` alone — see `productUnits.stockExport`.
  const canExportStock =
    hasPermission(accessQuery.data, 'inventory_cost:read') &&
    hasPermission(accessQuery.data, 'product:read') &&
    hasPermission(accessQuery.data, 'product_unit:read') &&
    hasPermission(accessQuery.data, 'quote:read');
  const stockExportMutation = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery(
        trpc.productUnits.stockExport.queryOptions({
          columnFilters: tableController.listInput.columnFilters,
          search: tableController.listInput.search,
        }),
      ),
    onError: (error) => showMutationError(error, 'Unable to export units.'),
    onSuccess: (rows) => downloadProductUnitStockExport(rows),
  });

  const filterOptionsQuery = useQuery(trpc.productUnits.filterOptions.queryOptions());
  const unitsQuery = useInfiniteQuery(
    trpc.productUnits.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: units, total } = useCombinedCursorQueryPages(unitsQuery.data?.pages);

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
        accessorFn: (unit) => unit.product.name,
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            <EntityThumbnail
              label={row.original.product.modelCode || row.original.product.name}
              size="sm"
              thumbnailDataUrl={row.original.product.thumbnailDataUrl}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{row.original.product.name}</span>
              <span className="truncate text-muted-foreground text-xs">{row.original.product.modelCode}</span>
            </span>
          </span>
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
        cell: ({ row }) => (
          <ProductUnitBuildStateCell buildState={row.original.buildState} owner={row.original.owner} />
        ),
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Build',
        id: 'buildState',
        meta: {
          filterOptions: ProductUnitDisplayBuildState.options.map((state) => ({
            label: productUnitBuildStateLabels[state],
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

  const exportAction = canExportStock ? (
    <Button
      disabled={stockExportMutation.isPending}
      onClick={() => stockExportMutation.mutate()}
      size={render ? 'default' : 'sm'}
      variant="outline"
    >
      {stockExportMutation.isPending ? (
        <IconLoader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <IconDownload data-icon="inline-start" />
      )}
      Export Units
    </Button>
  ) : null;

  const tableContent = (
    <DataTable
      emptyMessage="No units found."
      errorMessage={getApiQueryErrorMessage(unitsQuery.error, 'Unable to load units.')}
      getRowAriaLabel={(unit) => `Open unit ${unit.productSerialNumber}`}
      globalFilterPlaceholder="Search by serial, VIN, owner, or product..."
      isLoading={unitsQuery.isPending}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: unitsQuery.hasNextPage,
        isFetchingNextPage: unitsQuery.isFetchingNextPage,
        loadedCount: units.length,
        onLoadMore: () => void unitsQuery.fetchNextPage(),
      }}
      onRowClick={onOpenUnit}
      rightSection={render ? null : exportAction}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'unit' : 'units'}`}
    />
  );

  return render ? render({ exportAction, tableContent }) : tableContent;
};

function getProductUnitListInputExtras(columnFilters: ColumnFiltersState) {
  const owner = getColumnFilterValue(columnFilters, 'owner');
  const buildState = getColumnFilterValue(columnFilters, 'buildState');

  return {
    columnFilters: {
      buildState: ProductUnitDisplayBuildState.safeParse(buildState).data,
      owner,
      productId: getColumnFilterValue(columnFilters, 'product'),
    },
  } satisfies Pick<ProductUnitListInput, 'columnFilters'>;
}

function getColumnFilterValue(columnFilters: ColumnFiltersState, id: string): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
