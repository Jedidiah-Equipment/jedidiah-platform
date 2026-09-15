import type { ColumnFiltersState, RowData, SortingState } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { DataTable } from './DataTable.js';
import { type DataTableColumnDef, useDataTable } from './features.js';

/** A browser-owned list: every row is loaded up front, then searched, sorted and windowed locally. */
export function ClientDataTable<T extends RowData>({
  rows,
  columns,
  loading,
  onOpen,
  controls,
  emptyMessage,
  searchPlaceholder,
}: {
  rows: T[];
  columns: DataTableColumnDef<T>[];
  loading: boolean;
  onOpen: (row: T) => void;
  controls?: ReactNode;
  emptyMessage: string;
  searchPlaceholder: string;
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
      emptyMessage={emptyMessage}
      isLoading={loading}
      onRowClick={onOpen}
      rightSection={controls}
      globalFilterPlaceholder={searchPlaceholder}
    />
  );
}
