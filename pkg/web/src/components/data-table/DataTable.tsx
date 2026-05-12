import {
  type Cell,
  type Column,
  flexRender,
  type Header,
  type RowData,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  FunnelIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Input } from "@/components/ui/input.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { cn } from "@/lib/utils.js";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    cellClassName?: string;
    headerClassName?: string;
  }
}

type DataTableProps<TData> = {
  emptyMessage: string;
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
  filterDebounceMs = 250,
  globalFilterPlaceholder = "Search...",
  isLoading = false,
  loadingRowCount = 4,
  pageSizeOptions = [10, 25, 50],
  table,
  total,
  totalLabel = (value) => `${value} ${value === 1 ? "row" : "rows"}`,
}: DataTableProps<TData>) {
  const pagination = table.getState().pagination;
  const page = pagination.pageIndex + 1;
  const pageCount = table.getPageCount();
  const visibleColumns = table.getVisibleLeafColumns();
  const globalFilter = String(table.getState().globalFilter ?? "");
  const [globalFilterDraft, setGlobalFilterDraft] = useState(globalFilter);

  useEffect(() => {
    setGlobalFilterDraft(globalFilter);
  }, [globalFilter]);

  useEffect(() => {
    if (globalFilterDraft === globalFilter) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      table.setGlobalFilter(globalFilterDraft);
    }, filterDebounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [filterDebounceMs, globalFilter, globalFilterDraft, table]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(event) => setGlobalFilterDraft(event.target.value)}
            placeholder={globalFilterPlaceholder}
            value={globalFilterDraft}
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={header.column.columnDef.meta?.headerClassName}
                    key={header.id}
                  >
                    {header.isPlaceholder ? null : (
                      <DataTableHeader debounceMs={filterDebounceMs} header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <DataTableSkeletonRows columns={visibleColumns.length} rows={loadingRowCount} />
            ) : null}

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">{totalLabel(total)}</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows</span>
            <Select
              onValueChange={(value) => table.setPageSize(Number.parseInt(String(value), 10))}
              value={String(pagination.pageSize)}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {pageSizeOptions.map((pageSize) => (
                    <SelectItem key={pageSize} value={String(pageSize)}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Pagination className="w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </div>
    </div>
  );
}

type DataTableHeaderProps<TData> = {
  debounceMs: number;
  header: Header<TData, unknown>;
};

function DataTableHeader<TData>({ debounceMs, header }: DataTableHeaderProps<TData>) {
  const content = flexRender(header.column.columnDef.header, header.getContext());

  return (
    <div className={cn("flex items-center gap-1", isRightAligned(header) && "justify-end")}>
      <div className="min-w-0 truncate">{content}</div>
      {header.column.getCanSort() ? <DataTableSortButton column={header.column} /> : null}
      {header.column.getCanFilter() ? (
        <DataTableFilterButton column={header.column} debounceMs={debounceMs} />
      ) : null}
    </div>
  );
}

type DataTableSortButtonProps<TData> = {
  column: Column<TData, unknown>;
};

function DataTableSortButton<TData>({ column }: DataTableSortButtonProps<TData>) {
  const sorted = column.getIsSorted();
  const Icon = sorted === false ? ArrowUpDownIcon : sorted === "asc" ? ArrowUpIcon : ArrowDownIcon;
  const label = getColumnLabel(column);

  return (
    <Button
      aria-label={`Sort ${label}`}
      onClick={() => column.toggleSorting(sorted === "asc")}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Icon />
    </Button>
  );
}

type DataTableFilterButtonProps<TData> = {
  column: Column<TData, unknown>;
  debounceMs: number;
};

function DataTableFilterButton<TData>({ column, debounceMs }: DataTableFilterButtonProps<TData>) {
  const label = getColumnLabel(column);
  const filterValue = String(column.getFilterValue() ?? "");
  const [filterDraft, setFilterDraft] = useState(filterValue);

  useEffect(() => {
    setFilterDraft(filterValue);
  }, [filterValue]);

  useEffect(() => {
    if (filterDraft === filterValue) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      column.setFilterValue(filterDraft ? filterDraft : undefined);
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [column, debounceMs, filterDraft, filterValue]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Filter ${label}`}
            size="icon-sm"
            type="button"
            variant={filterValue ? "secondary" : "ghost"}
          />
        }
      >
        <FunnelIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground">Filter {label}</div>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              className="h-7 px-2 text-sm"
              onChange={(event) => setFilterDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={`Filter ${label.toLowerCase()}...`}
              value={filterDraft}
            />
            <Button
              aria-label={`Clear ${label} filter`}
              disabled={!filterDraft}
              onClick={() => {
                setFilterDraft("");
                column.setFilterValue(undefined);
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type DataTableSkeletonRowsProps = {
  columns: number;
  rows: number;
};

function DataTableSkeletonRows({ columns, rows }: DataTableSkeletonRowsProps) {
  const rowKeys = createSkeletonKeys("row", rows);
  const columnKeys = createSkeletonKeys("cell", Math.max(columns, 1));

  return rowKeys.map((rowKey) => (
    <TableRow key={rowKey}>
      {columnKeys.map((columnKey) => (
        <TableCell key={`${rowKey}-${columnKey}`}>
          <Skeleton className={columnKey === columnKeys.at(-1) ? "h-4 w-20" : "h-4 w-full"} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function getCellClassName<TData>(cell: Cell<TData, unknown>): string | undefined {
  return cell.column.columnDef.meta?.cellClassName;
}

function getColumnLabel<TData>(column: Column<TData, unknown>): string {
  return typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
}

function isRightAligned<TData>(header: Header<TData, unknown>): boolean {
  return header.column.columnDef.meta?.headerClassName?.includes("text-right") ?? false;
}

function createSkeletonKeys(prefix: string, length: number): string[] {
  return Array.from({ length }, (_value, index) => `${prefix}-${index + 1}`);
}
