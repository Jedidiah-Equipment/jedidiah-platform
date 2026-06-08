import type { Table } from '@tanstack/react-table';
import type React from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';

type DataTablePaginationProps<TData> = {
  pageSizeOptions: number[];
  table: Table<TData>;
  total: number;
  totalLabel: (total: number) => React.ReactNode;
};

export function DataTablePagination<TData>({
  pageSizeOptions,
  table,
  total,
  totalLabel,
}: DataTablePaginationProps<TData>) {
  const pagination = table.getState().pagination;
  const page = pagination.pageIndex + 1;
  const pageCount = table.getPageCount();
  const paginationItems = getPaginationItems(page, pageCount);

  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="text-sm text-muted-foreground">{totalLabel(total)}</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows</span>
          <Select
            onValueChange={(value) => table.setPageSize(Number.parseInt(String(value), 10))}
            value={String(pagination.pageSize)}
          >
            <SelectTrigger className="text-sm" size="sm">
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
      </div>
      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent className="text-sm">
          <PaginationItem>
            <PaginationPrevious
              className="text-sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="sm"
            />
          </PaginationItem>
          {paginationItems.map((item, index) => (
            <PaginationItem key={item === 'ellipsis' ? `ellipsis-${index}` : item}>
              {item === 'ellipsis' ? (
                <PaginationEllipsis className="size-7 text-sm" />
              ) : (
                <PaginationLink
                  className="text-sm"
                  isActive={item === page}
                  onClick={() => table.setPageIndex(item - 1)}
                  size="icon-sm"
                >
                  {item}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              className="text-sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="sm"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

type PaginationItemValue = 'ellipsis' | number;

export function getPaginationItems(page: number, pageCount: number): PaginationItemValue[] {
  if (pageCount <= 3) {
    return range(1, pageCount);
  }

  if (page <= 3) {
    return [1, 2, 3, 'ellipsis'];
  }

  if (page >= pageCount - 2) {
    return ['ellipsis', ...range(pageCount - 2, pageCount)];
  }

  return ['ellipsis', page - 1, page, page + 1, 'ellipsis'];
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
