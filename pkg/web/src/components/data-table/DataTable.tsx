import type { CellData, RowData, TableFeatures } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import * as React from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area.js';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { cn } from '@/lib/utils.js';
import { DataTableHeader } from './components/DataTableHeader.js';
import { DataTableLoadMore } from './components/DataTableLoadMore.js';
import { DataTableSearch } from './components/DataTableSearch.js';
import { DataTableSkeletonRows } from './components/DataTableSkeletonRows.js';
import type {
  DataTableCellContext,
  DataTableCellInstance,
  DataTableColumnInstance,
  DataTableInstance,
  DataTableRowInstance,
} from './features.js';
import { getCellClassName, hasActiveFilterValue } from './utils.js';

declare module '@tanstack/react-table' {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    cellClassName?: string;
    filterOptions?: { label: string; value: string }[];
    filterVariant?: 'date-range' | 'multi-select' | 'select' | 'text';
    headerClassName?: string;
  }
}

type DataTableLoadMoreProps = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  loadedCount: number;
  onLoadMore: () => void;
};

type DataTableProps<TData extends RowData> = {
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
  rightSection?: React.ReactNode;
  tableClassName?: string;
  table: DataTableInstance<TData>;
  total: number;
  totalLabel?: (total: number) => React.ReactNode;
} & (
  | {
      loadMore?: never;
      pageSize?: never;
      paginationMode: 'complete';
    }
  | {
      loadMore: DataTableLoadMoreProps;
      pageSize?: never;
      paginationMode: 'cursor';
    }
  | {
      loadMore?: never;
      /** Rows shown at first, and the step each Load more adds. */
      pageSize?: number;
      paginationMode: 'incremental';
    }
);

const DEFAULT_INCREMENTAL_PAGE_SIZE = 25;

export function DataTable<TData extends RowData>({
  emptyMessage,
  errorMessage,
  filterDebounceMs = 250,
  getRowAriaLabel,
  getRowClassName,
  getRowState,
  globalFilterPlaceholder = 'Search...',
  hideGlobalFilter = false,
  isLoading = false,
  loadMore,
  loadingRowCount = 10,
  onRowClick,
  pageSize = DEFAULT_INCREMENTAL_PAGE_SIZE,
  paginationMode,
  rightSection,
  table,
  tableClassName,
  total,
  totalLabel = (value) => `${value} ${value === 1 ? 'row' : 'rows'}`,
}: DataTableProps<TData>) {
  const visibleColumns = table.getVisibleLeafColumns();
  const tableState = table.state;
  const hasActiveFilters =
    hasActiveFilterValue(tableState.globalFilter) ||
    tableState.columnFilters.some((filter) => hasActiveFilterValue(filter.value));
  const showToolbar = !hideGlobalFilter || rightSection || hasActiveFilters;
  const [visibleRowCount, setVisibleRowCount] = React.useState(pageSize);
  const modelRows = table.getRowModel().rows;
  // Incremental mode paints a window of rows the browser already holds: sorting, searching and row
  // selection still see every row, so a bulk action over the whole list stays whole.
  const rows = paginationMode === 'incremental' ? modelRows.slice(0, visibleRowCount) : modelRows;

  return (
    // `min-w-0` so a wide table shrinks to its container instead of stretching it: a flex or grid
    // item defaults to `min-width: auto`, which refuses to go below the table's min-content width,
    // and the page ends up scrolling sideways with the ScrollArea below never getting the chance.
    <div className="flex min-w-0 flex-col gap-3">
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

              {!isLoading && rows.length === 0 ? (
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
                ? rows.map((row) => (
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

      {paginationMode === 'cursor' ? (
        <DataTableLoadMore
          hasNextPage={loadMore.hasNextPage}
          isFetchingNextPage={loadMore.isFetchingNextPage}
          loadedCount={loadMore.loadedCount}
          onLoadMore={loadMore.onLoadMore}
          total={total}
          totalLabel={totalLabel}
        />
      ) : paginationMode === 'incremental' ? (
        <DataTableLoadMore
          hasNextPage={rows.length < modelRows.length}
          loadedCount={rows.length}
          onLoadMore={() => setVisibleRowCount((count) => count + pageSize)}
          total={total}
          totalLabel={totalLabel}
        />
      ) : (
        <DataTableLoadMore loadedCount={rows.length} total={total} totalLabel={totalLabel} />
      )}
    </div>
  );
}

function DataTableRow<TData extends RowData>({
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
  row: DataTableRowInstance<TData>;
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
          <DataTableCellContent cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  );
}

function DataTableCellContent<TData extends RowData>({ cell }: { cell: DataTableCellInstance<TData> }) {
  const rendererRef = React.useRef<CellRenderer<TData>>(undefined);
  rendererRef.current = cell.column.columnDef.cell;

  // TanStack's flexRender uses the callback itself as the React component type. Callers often rebuild
  // columns when async options arrive, so keeping this adapter stable prevents editable cells remounting.
  return <StableCellRenderer {...cell.getContext()} rendererRef={rendererRef} />;
}

type CellRenderer<TData extends RowData> = DataTableCellInstance<TData>['column']['columnDef']['cell'];

function StableCellRenderer<TData extends RowData>({
  rendererRef,
  ...context
}: DataTableCellContext<TData> & { rendererRef: React.RefObject<CellRenderer<TData>> }) {
  const renderer = rendererRef.current;
  const isClassComponent =
    typeof renderer === 'function' &&
    Boolean((renderer as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent);

  if (typeof renderer === 'function' && !isClassComponent) {
    return renderer(context);
  }

  return flexRender(renderer, context);
}

function getPinnedColumnClassName<TData extends RowData>(
  column: DataTableColumnInstance<TData>,
  kind: 'cell' | 'header',
) {
  const pinned = column.getIsPinned();

  if (!pinned) {
    return undefined;
  }

  // bg-inherit tracks the row's background through every state (hover, selected) because the
  // row paints an opaque --table-row-bg; sticky cells therefore never need their own colors.
  return cn(
    'sticky bg-inherit',
    kind === 'header' ? 'z-30' : 'z-20',
    pinned === 'start' &&
      column.getIsLastColumn('start') &&
      'after:absolute after:inset-y-0 after:end-0 after:w-px after:bg-border/80 after:content-[""] before:absolute before:inset-y-0 before:end-0 before:w-6 before:translate-x-full before:bg-gradient-to-r before:from-black/30 before:to-transparent before:content-[""]',
    pinned === 'end' &&
      column.getIsFirstColumn('end') &&
      'after:absolute after:inset-y-0 after:start-0 after:w-px after:bg-border/80 after:content-[""] before:absolute before:inset-y-0 before:start-0 before:w-6 before:-translate-x-full before:bg-gradient-to-l before:from-black/30 before:to-transparent before:content-[""]',
  );
}

function getPinnedColumnStyle<TData extends RowData>(
  column: DataTableColumnInstance<TData>,
): React.CSSProperties | undefined {
  const pinned = column.getIsPinned();

  if (!pinned) {
    return undefined;
  }

  return {
    insetInlineStart: pinned === 'start' ? `${column.getStart('start')}px` : undefined,
    insetInlineEnd: pinned === 'end' ? `${column.getAfter('end')}px` : undefined,
    maxWidth: `${column.getSize()}px`,
    minWidth: `${column.getSize()}px`,
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
