import { flexRender, type RowData, type Table as TanStackTable } from '@tanstack/react-table';
import type React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { DataTableHeader } from './components/DataTableHeader.js';
import { DataTablePagination } from './components/DataTablePagination.js';
import { DataTableSearch } from './components/DataTableSearch.js';
import { DataTableSkeletonRows } from './components/DataTableSkeletonRows.js';
import { getCellClassName } from './utils.js';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    cellClassName?: string;
    headerClassName?: string;
  }
}

type DataTableProps<TData> = {
  emptyMessage: string;
  errorMessage?: string | undefined;
  filterDebounceMs?: number;
  globalFilterPlaceholder?: string;
  isLoading?: boolean;
  loadingRowCount?: number;
  pageSizeOptions?: number[];
  table: TanStackTable<TData>;
  total: number;
  totalLabel?: (total: number) => React.ReactNode;
};

export function DataTable<TData>({
  emptyMessage,
  errorMessage,
  filterDebounceMs = 250,
  globalFilterPlaceholder = 'Search...',
  isLoading = false,
  loadingRowCount = 4,
  pageSizeOptions = [10, 25, 50],
  table,
  total,
  totalLabel = (value) => `${value} ${value === 1 ? 'row' : 'rows'}`,
}: DataTableProps<TData>) {
  const visibleColumns = table.getVisibleLeafColumns();

  return (
    <div className="flex flex-col gap-4">
      <DataTableSearch debounceMs={filterDebounceMs} placeholder={globalFilterPlaceholder} table={table} />

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead className={header.column.columnDef.meta?.headerClassName} key={header.id}>
                    {header.isPlaceholder ? null : <DataTableHeader debounceMs={filterDebounceMs} header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? <DataTableSkeletonRows columns={visibleColumns.length} rows={loadingRowCount} /> : null}

            {!isLoading && table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={Math.max(visibleColumns.length, 1)}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : null}

            {!isLoading
              ? table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell className={getCellClassName(cell)} key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination pageSizeOptions={pageSizeOptions} table={table} total={total} totalLabel={totalLabel} />
    </div>
  );
}
