import {
  PART_UNIT_OF_MEASURE_LABELS,
  type Part,
  type PartListInput,
  PartSortBy,
  PartUnitOfMeasure,
  type UUID,
} from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { usePartCategoryOptions, usePartStorageLocationOptions } from '@/equipment/hooks/options/index.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartLabelPrintButton } from '../PartLabelPrintButton.js';

type PartTableProps = {
  onEditPart: ((part: Part) => void) | undefined;
  rightSection?: React.ReactNode;
  supplierId?: UUID;
};

export const usePartTableStore = createPartTableStore('supplier-parts-table');

const useAllPartsTableStore = createPartTableStore('parts-table');

function createPartTableStore(persistName: string) {
  return createPersistedDataTableStore({
    initialState: {
      sorting: [
        {
          id: 'name',
          desc: false,
        },
      ],
    },
    persistName,
  });
}

const partSortOptions: SortOptions<PartListInput> = {
  allowedSortIds: PartSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

export const PartTable: React.FC<PartTableProps> = ({ onEditPart, rightSection, supplierId }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: supplierId ? usePartTableStore : useAllPartsTableStore,
    sortOptions: partSortOptions,
    getListInputExtras: (columnFilters) => getPartListInputExtras(columnFilters, supplierId),
  });

  const partsQuery = useInfiniteQuery(
    trpc.parts.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const categoryOptions = usePartCategoryOptions();
  const storageLocationOptions = usePartStorageLocationOptions();
  const { items: parts, total } = useCombinedCursorQueryPages(partsQuery.data?.pages);

  const columns = useMemo<DataTableColumnDef<Part>[]>(() => {
    const tableColumns: DataTableColumnDef<Part>[] = [
      {
        accessorKey: 'code',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Code',
      },
      {
        accessorKey: 'drawingCode',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.drawingCode ?? '-'}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Drawing code',
      },
      {
        accessorKey: 'description',
        cell: ({ row }) => <span className="line-clamp-2 max-w-md">{row.original.description}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Description',
      },
      {
        accessorKey: 'supplierCode',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.supplierCode}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Supplier code',
      },
      ...(!supplierId
        ? [
            {
              accessorKey: 'supplier.companyName',
              enableColumnFilter: true,
              enableSorting: true,
              header: 'Supplier',
              id: 'supplierName',
            } satisfies DataTableColumnDef<Part>,
          ]
        : []),
      {
        accessorKey: 'finish',
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Finish',
      },
      {
        accessorKey: 'unitOfMeasure',
        cell: ({ row }) => PART_UNIT_OF_MEASURE_LABELS[row.original.unitOfMeasure],
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Unit',
        meta: {
          filterOptions: PartUnitOfMeasure.options.map((unitOfMeasure) => ({
            label: PART_UNIT_OF_MEASURE_LABELS[unitOfMeasure],
            value: unitOfMeasure,
          })),
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'isInternallyFabricated',
        cell: ({ row }) => (row.original.isInternallyFabricated ? 'Yes' : 'No'),
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Internal',
        meta: {
          filterOptions: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'storageLocation',
        cell: ({ row }) => row.original.storageLocation ?? '-',
        enableColumnFilter: true,
        enableSorting: false,
        header: 'Storage location',
        meta: {
          filterOptions: storageLocationOptions.selectOptions,
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'category',
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Category',
        meta: {
          filterOptions: categoryOptions.selectOptions,
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Name',
      },
      createPartLabelActionColumn(),
    ];

    return tableColumns;
  }, [categoryOptions.selectOptions, storageLocationOptions.selectOptions, supplierId]);

  const table = useDataTable({
    columns,
    data: parts,
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
      emptyMessage="No parts found."
      errorMessage={getApiQueryErrorMessage(partsQuery.error, 'Unable to load parts.')}
      getRowAriaLabel={onEditPart ? (part) => `Edit ${part.name}` : undefined}
      globalFilterPlaceholder="Search parts..."
      isLoading={partsQuery.isPending}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: partsQuery.hasNextPage,
        isFetchingNextPage: partsQuery.isFetchingNextPage,
        loadedCount: parts.length,
        onLoadMore: () => void partsQuery.fetchNextPage(),
      }}
      onRowClick={onEditPart}
      rightSection={rightSection}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
};

export function createPartLabelActionColumn(): DataTableColumnDef<Part> {
  return {
    cell: ({ row }) => (
      <div className="flex justify-end">
        <PartLabelPrintButton partId={row.original.id} size="xs" />
      </div>
    ),
    enableColumnFilter: false,
    enableSorting: false,
    header: '',
    id: 'label',
    meta: {
      cellClassName: 'w-[96px]',
    },
    size: 96,
  };
}

function getPartListInputExtras(columnFilters: ColumnFiltersState, supplierId?: UUID) {
  return {
    category: getColumnFilterValue(columnFilters, 'category'),
    columnFilters: {
      code: getColumnFilterValue(columnFilters, 'code'),
      isInternallyFabricated: getInternallyFabricatedFilterValue(columnFilters),
      name: getColumnFilterValue(columnFilters, 'name'),
      storageLocation: getColumnFilterValue(columnFilters, 'storageLocation'),
      supplierCode: getColumnFilterValue(columnFilters, 'supplierCode'),
      supplierName: getColumnFilterValue(columnFilters, 'supplierName'),
      unitOfMeasure: getUnitOfMeasureFilterValue(columnFilters),
    },
    supplierId,
  } satisfies Pick<PartListInput, 'category' | 'columnFilters' | 'supplierId'>;
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'category' | 'code' | 'name' | 'storageLocation' | 'supplierCode' | 'supplierName',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}

function getInternallyFabricatedFilterValue(
  columnFilters: ColumnFiltersState,
): PartListInput['columnFilters']['isInternallyFabricated'] {
  const value = columnFilters.find((filter) => filter.id === 'isInternallyFabricated')?.value;

  if (value === 'true') return true;
  if (value === 'false') return false;

  return undefined;
}

function getUnitOfMeasureFilterValue(
  columnFilters: ColumnFiltersState,
): PartListInput['columnFilters']['unitOfMeasure'] {
  const value = columnFilters.find((filter) => filter.id === 'unitOfMeasure')?.value;
  const parsed = PartUnitOfMeasure.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}
