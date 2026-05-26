import { flexRender, type RowData, type Table as TanStackTable } from '@tanstack/react-table';
import type React from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area.js';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { cn } from '@/lib/utils.js';
import { DataTableHeader } from './components/DataTableHeader.js';
import { DataTablePagination } from './components/DataTablePagination.js';
import { DataTableSearch } from './components/DataTableSearch.js';
import { DataTableSkeletonRows } from './components/DataTableSkeletonRows.js';
import { getCellClassName } from './utils.js';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    cellClassName?: string;
    filterOptions?: { label: string; value: string }[];
    filterVariant?: 'date-range' | 'multi-select' | 'select' | 'text';
    headerClassName?: string;
  }
}

type DataTableProps<TData> = {
  emptyMessage: string;
  errorMessage?: string | undefined;
  filterDebounceMs?: number;
  globalFilterPlaceholder?: string;
  hideGlobalFilter?: boolean;
  isLoading?: boolean;
  loadingRowCount?: number;
  pageSizeOptions?: number[];
  rightSection?: React.ReactNode;
  tableClassName?: string;
  table: TanStackTable<TData>;
  total: number;
  totalLabel?: (total: number) => React.ReactNode;
};

export function DataTable<TData>({
  emptyMessage,
  errorMessage,
  filterDebounceMs = 250,
  globalFilterPlaceholder = 'Search...',
  hideGlobalFilter = false,
  isLoading = false,
  loadingRowCount = 10,
  pageSizeOptions = [10, 25, 50],
  rightSection,
  table,
  tableClassName,
  total,
  totalLabel = (value) => `${value} ${value === 1 ? 'row' : 'rows'}`,
}: DataTableProps<TData>) {
  const visibleColumns = table.getVisibleLeafColumns();

  return (
    <div className="flex flex-col gap-4">
      {!hideGlobalFilter || rightSection ? (
        <DataTableSearch
          debounceMs={filterDebounceMs}
          placeholder={globalFilterPlaceholder}
          rightSection={rightSection}
          table={table}
        />
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <ScrollArea className="w-full">
          <table data-slot="table" className={cn('w-full caption-bottom text-sm', tableClassName)}>
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
          </table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <DataTablePagination pageSizeOptions={pageSizeOptions} table={table} total={total} totalLabel={totalLabel} />
    </div>
  );
}
