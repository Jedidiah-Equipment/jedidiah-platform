import {
  PART_UNIT_OF_MEASURE_LABELS,
  type Part,
  type PartListInput,
  PartSortBy,
  PartUnitOfMeasure,
  type UUID,
} from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { usePartCategoryOptions } from '@/hooks/options/index.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

type PartTableProps = {
  onEditPart: ((part: Part) => void) | undefined;
  rightSection?: React.ReactNode;
  supplierId: UUID;
};

export const usePartTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'name',
        desc: false,
      },
    ],
  },
  persistName: 'supplier-parts-table',
});

const partSortOptions: SortOptions<PartListInput> = {
  allowedSortIds: PartSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

export const PartTable: React.FC<PartTableProps> = ({ onEditPart, rightSection, supplierId }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: usePartTableStore,
    sortOptions: partSortOptions,
    getListInputExtras: (columnFilters) => getPartListInputExtras(columnFilters, supplierId),
  });

  const partsQuery = useQuery(
    trpc.parts.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const categoryOptions = usePartCategoryOptions();

  const { items: parts, total, isLoading } = usePagedQueryResult(partsQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: partSortOptions,
    total,
  });

  const columns = useMemo<ColumnDef<Part>[]>(() => {
    const tableColumns: ColumnDef<Part>[] = [
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
    ];

    return tableColumns;
  }, [categoryOptions.selectOptions]);

  const table = useReactTable({
    columns,
    data: parts,
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
      emptyMessage="No parts found."
      errorMessage={getApiQueryErrorMessage(partsQuery.error, 'Unable to load parts.')}
      getRowAriaLabel={onEditPart ? (part) => `Edit ${part.name}` : undefined}
      globalFilterPlaceholder="Search parts..."
      isLoading={isLoading}
      onRowClick={onEditPart}
      rightSection={rightSection}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
};

function getPartListInputExtras(columnFilters: ColumnFiltersState, supplierId: UUID) {
  return {
    category: getColumnFilterValue(columnFilters, 'category'),
    columnFilters: {
      code: getColumnFilterValue(columnFilters, 'code'),
      isInternallyFabricated: getInternallyFabricatedFilterValue(columnFilters),
      name: getColumnFilterValue(columnFilters, 'name'),
      supplierCode: getColumnFilterValue(columnFilters, 'supplierCode'),
      unitOfMeasure: getUnitOfMeasureFilterValue(columnFilters),
    },
    supplierId,
  } satisfies Pick<PartListInput, 'category' | 'columnFilters' | 'supplierId'>;
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'category' | 'code' | 'name' | 'supplierCode',
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
