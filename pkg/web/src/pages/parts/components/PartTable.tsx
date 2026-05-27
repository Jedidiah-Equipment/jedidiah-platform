import { type Part, type PartListInput, PartSortBy } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ColumnDef, type ColumnFiltersState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { useConstrainedTableState } from '@/components/data-table/hooks/use-constrained-table-state.js';
import { usePagedQueryResult } from '@/components/data-table/hooks/use-paged-query-result.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { Button } from '@/components/ui/button.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

type PartTableProps = {
  onEditPart: ((part: Part) => void) | undefined;
  showEditActions: boolean;
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
  persistName: 'parts-table',
});

const partSortOptions: SortOptions<PartListInput> = {
  allowedSortIds: PartSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

export const PartTable: React.FC<PartTableProps> = ({ onEditPart, showEditActions }) => {
  const trpc = useTRPC();

  const tableController = useServerSideTableController({
    store: usePartTableStore,
    sortOptions: partSortOptions,
    getListInputExtras: getPartListInputExtras,
  });

  const partsQuery = useQuery(
    trpc.parts.list.queryOptions(tableController.listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const categoriesQuery = useQuery(trpc.parts.categories.queryOptions());

  const { items: parts, total, isLoading } = usePagedQueryResult(partsQuery);

  const tableState = useConstrainedTableState({
    pagination: tableController.pagination,
    setPageIndex: tableController.setPageIndex,
    sorting: tableController.sorting,
    sortOptions: partSortOptions,
    total,
  });

  const categoryFilterOptions = useMemo(
    () =>
      categoriesQuery.data?.categories.map((category) => ({
        label: category,
        value: category,
      })) ?? [],
    [categoriesQuery.data?.categories],
  );

  const columns = useMemo<ColumnDef<Part>[]>(() => {
    const tableColumns: ColumnDef<Part>[] = [
      {
        accessorKey: 'name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Name',
      },
      {
        accessorKey: 'code',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Code',
      },

      {
        accessorKey: 'finish',
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Finish',
      },
      {
        accessorKey: 'drawingCode',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.drawingCode ?? '-'}</span>,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Drawing code',
      },

      {
        accessorKey: 'supplierName',
        cell: ({ row }) => row.original.supplier.companyName,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Supplier',
      },
      {
        accessorKey: 'supplierCode',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.supplierCode}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Supplier code',
      },
      {
        accessorKey: 'category',
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Category',
        meta: {
          filterOptions: categoryFilterOptions,
          filterVariant: 'select',
        },
      },
    ];

    if (showEditActions && onEditPart) {
      tableColumns.push({
        id: 'actions',
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEditPart?.(row.original)}
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
  }, [categoryFilterOptions, onEditPart, showEditActions]);

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
      globalFilterPlaceholder="Search parts..."
      isLoading={isLoading}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
};

function getPartListInputExtras(columnFilters: ColumnFiltersState) {
  return {
    category: getColumnFilterValue(columnFilters, 'category'),
    columnFilters: {
      code: getColumnFilterValue(columnFilters, 'code'),
      name: getColumnFilterValue(columnFilters, 'name'),
      supplierCode: getColumnFilterValue(columnFilters, 'supplierCode'),
      supplierName: getColumnFilterValue(columnFilters, 'supplierName'),
    },
  } satisfies Pick<PartListInput, 'category' | 'columnFilters'>;
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: 'category' | 'code' | 'name' | 'supplierCode' | 'supplierName',
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === 'string' && value ? value : undefined;
}
