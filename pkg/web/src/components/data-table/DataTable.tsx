import { type Column, flexRender, type Row, type RowData, type Table as TanStackTable } from '@tanstack/react-table';
import type React from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area.js';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { cn } from '@/lib/utils.js';
import { DataTableHeader } from './components/DataTableHeader.js';
import { DataTablePagination } from './components/DataTablePagination.js';
import { DataTableSearch } from './components/DataTableSearch.js';
import { DataTableSkeletonRows } from './components/DataTableSkeletonRows.js';
import { getCellClassName, hasActiveFilterValue } from './utils.js';

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
  getRowAriaLabel?: ((item: TData) => string) | undefined;
  getRowClassName?: ((item: TData) => string | undefined) | undefined;
  getRowState?: ((item: TData) => 'selected' | undefined) | undefined;
  globalFilterPlaceholder?: string;
  hideGlobalFilter?: boolean;
  isLoading?: boolean;
  loadingRowCount?: number;
  onRowClick?: ((item: TData) => void) | undefined;
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
  getRowAriaLabel,
  getRowClassName,
  getRowState,
  globalFilterPlaceholder = 'Search...',
  hideGlobalFilter = false,
  isLoading = false,
  loadingRowCount = 10,
  onRowClick,
  pageSizeOptions = [10, 25, 50],
  rightSection,
  table,
  tableClassName,
  total,
  totalLabel = (value) => `${value} ${value === 1 ? 'row' : 'rows'}`,
}: DataTableProps<TData>) {
  const visibleColumns = table.getVisibleLeafColumns();
  const tableState = table.getState();
  const hasActiveFilters =
    hasActiveFilterValue(tableState.globalFilter) ||
    tableState.columnFilters.some((filter) => hasActiveFilterValue(filter.value));
  const showToolbar = !hideGlobalFilter || rightSection || hasActiveFilters;

  return (
    <div className="flex flex-col gap-4">
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card text-card-foreground">
        {showToolbar ? (
          <DataTableSearch
            debounceMs={filterDebounceMs}
            placeholder={globalFilterPlaceholder}
            rightSection={rightSection}
            showResetFilters={hasActiveFilters}
            showSearch={!hideGlobalFilter}
            table={table}
          />
        ) : null}

        <ScrollArea className="w-full">
          <table
            data-slot="table"
            className={cn(
              'w-full caption-bottom text-sm',
              '[--table-row-bg:var(--card)] [--table-row-bg-hover:color-mix(in_oklab,var(--muted)_50%,var(--card))]',
              tableClassName,
            )}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      className={cn(
                        header.column.columnDef.meta?.headerClassName,
                        getPinnedColumnClassName(header.column, 'header'),
                      )}
                      key={header.id}
                      style={getPinnedColumnStyle(header.column)}
                    >
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
                ? table
                    .getRowModel()
                    .rows.map((row) => (
                      <DataTableRow
                        getRowAriaLabel={getRowAriaLabel}
                        getRowClassName={getRowClassName}
                        getRowState={getRowState}
                        key={row.id}
                        onRowClick={onRowClick}
                        row={row}
                      />
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

function DataTableRow<TData>({
  getRowAriaLabel,
  getRowClassName,
  getRowState,
  onRowClick,
  row,
}: {
  getRowAriaLabel?: ((item: TData) => string) | undefined;
  getRowClassName?: ((item: TData) => string | undefined) | undefined;
  getRowState?: ((item: TData) => 'selected' | undefined) | undefined;
  onRowClick?: ((item: TData) => void) | undefined;
  row: Row<TData>;
}) {
  return (
    <TableRow
      aria-label={getRowAriaLabel?.(row.original)}
      className={cn(getRowClassName?.(row.original), onRowClick ? 'cursor-pointer' : undefined)}
      data-state={getRowState?.(row.original)}
      onClick={(event) => {
        if (!onRowClick || shouldIgnoreRowEvent(event.currentTarget, event.target)) {
          return;
        }

        onRowClick(row.original);
      }}
      onKeyDown={(event) => {
        if (!onRowClick || shouldIgnoreRowEvent(event.currentTarget, event.target)) {
          return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRowClick(row.original);
        }
      }}
      tabIndex={onRowClick ? 0 : undefined}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          className={cn(getCellClassName(cell), getPinnedColumnClassName(cell.column, 'cell'))}
          key={cell.id}
          style={getPinnedColumnStyle(cell.column)}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

function getPinnedColumnClassName<TData>(column: Column<TData, unknown>, kind: 'cell' | 'header') {
  const pinned = column.getIsPinned();

  if (!pinned) {
    return undefined;
  }

  // bg-inherit tracks the row's background through every state (hover, selected) because the
  // row paints an opaque --table-row-bg; sticky cells therefore never need their own colors.
  return cn(
    'sticky bg-inherit',
    kind === 'header' ? 'z-30' : 'z-20',
    pinned === 'left' &&
      column.getIsLastColumn('left') &&
      'after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border/80 after:content-[""] before:absolute before:inset-y-0 before:right-0 before:w-6 before:translate-x-full before:bg-gradient-to-r before:from-black/30 before:to-transparent before:content-[""]',
    pinned === 'right' &&
      column.getIsFirstColumn('right') &&
      'after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-border/80 after:content-[""] before:absolute before:inset-y-0 before:left-0 before:w-6 before:-translate-x-full before:bg-gradient-to-l before:from-black/30 before:to-transparent before:content-[""]',
  );
}

function getPinnedColumnStyle<TData>(column: Column<TData, unknown>): React.CSSProperties | undefined {
  const pinned = column.getIsPinned();

  if (!pinned) {
    return undefined;
  }

  return {
    left: pinned === 'left' ? `${column.getStart('left')}px` : undefined,
    maxWidth: `${column.getSize()}px`,
    minWidth: `${column.getSize()}px`,
    right: pinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    width: `${column.getSize()}px`,
  };
}

const interactiveTargetSelector = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
].join(',');

function isInteractiveEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(interactiveTargetSelector));
}

function shouldIgnoreRowEvent(rowElement: HTMLTableRowElement, target: EventTarget | null) {
  return !(target instanceof Node) || !rowElement.contains(target) || isInteractiveEventTarget(target);
}
