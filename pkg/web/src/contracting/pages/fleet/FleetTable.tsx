import type { ColumnFiltersState, RowData, SortingState } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
export function FleetTable<T extends RowData>({
  rows,
  columns,
  loading,
  onOpen,
  controls,
  searchPlaceholder = 'Search codes...',
}: {
  rows: T[];
  columns: DataTableColumnDef<T>[];
  loading: boolean;
  onOpen: (row: T) => void;
  controls?: ReactNode;
  searchPlaceholder?: string;
}) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useDataTable({
    columns,
    data: rows,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    state: { globalFilter, columnFilters, sorting },
  });
  return (
    <DataTable
      table={table}
      paginationMode="incremental"
      total={rows.length}
      emptyMessage="No fleet entries found."
      isLoading={loading}
      onRowClick={onOpen}
      rightSection={controls}
      globalFilterPlaceholder={searchPlaceholder}
    />
  );
}
