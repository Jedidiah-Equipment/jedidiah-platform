import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useEffect, useMemo } from "react";

import {
  constrainPagination,
  constrainSorting,
  getPageCount,
  type SortOptions,
} from "../table-state.js";

type UseConstrainedTableStateOptions<TSortSource extends string | { sortBy: string }> = {
  pagination: PaginationState;
  setPageIndex?: (pageIndex: number) => void;
  sorting: SortingState;
  sortOptions: SortOptions<TSortSource>;
  total: number;
};

type UseConstrainedPageIndexOptions = {
  pageCount: number;
  pagination: PaginationState;
  setPageIndex?: (pageIndex: number) => void;
};

export function useConstrainedTableState<TSortSource extends string | { sortBy: string }>({
  pagination,
  setPageIndex,
  sorting,
  sortOptions,
  total,
}: UseConstrainedTableStateOptions<TSortSource>) {
  const pageCount = getPageCount(total, pagination.pageSize);
  const constrainedPagination = useMemo(
    () => constrainPagination(pagination, pageCount),
    [pageCount, pagination],
  );
  const constrainedSorting = useMemo(
    () => constrainSorting(sorting, sortOptions),
    [sorting, sortOptions],
  );

  useConstrainedPageIndex({
    pageCount,
    pagination,
    ...(setPageIndex ? { setPageIndex } : {}),
  });

  return {
    pageCount,
    pagination: constrainedPagination,
    sorting: constrainedSorting,
  };
}

export function useConstrainedPageIndex({
  pageCount,
  pagination,
  setPageIndex,
}: UseConstrainedPageIndexOptions) {
  useEffect(() => {
    if (!setPageIndex) {
      return;
    }

    const maxPageIndex = Math.max(pageCount - 1, 0);

    if (pagination.pageIndex > maxPageIndex) {
      setPageIndex(maxPageIndex);
    }
  }, [pageCount, pagination.pageIndex, setPageIndex]);
}
