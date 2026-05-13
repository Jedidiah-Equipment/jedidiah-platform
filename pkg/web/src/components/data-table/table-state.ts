import type { PaginationState, SortingState } from "@tanstack/react-table";

type SortId<TSortSource extends string | { sortBy: string }> = TSortSource extends string
  ? TSortSource
  : TSortSource extends { sortBy: infer TSortId extends string }
    ? TSortId
    : never;

type SortState<TSortId extends string> = {
  desc?: boolean;
  id: TSortId;
};

export type SortOptions<TSortSource extends string | { sortBy: string }> = {
  allowedSortIds: readonly SortId<TSortSource>[];
  defaultSort: SortState<SortId<TSortSource>>;
};

export function getPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function constrainPagination(
  pagination: PaginationState,
  pageCount: number,
): PaginationState {
  return {
    ...pagination,
    pageIndex: Math.min(pagination.pageIndex, Math.max(pageCount - 1, 0)),
  };
}

export function getPrimarySort<TSortSource extends string | { sortBy: string }>(
  sorting: SortingState,
  options: SortOptions<TSortSource>,
): SortState<SortId<TSortSource>> {
  const sort = sorting[0];
  const sortId = options.allowedSortIds.find((id) => id === sort?.id) ?? options.defaultSort.id;

  return {
    id: sortId,
    desc: sort?.id === sortId ? (sort.desc ?? false) : (options.defaultSort.desc ?? false),
  };
}

export function constrainSorting<TSortSource extends string | { sortBy: string }>(
  sorting: SortingState,
  options: SortOptions<TSortSource>,
): SortingState {
  const sort = getPrimarySort(sorting, options);

  return [
    {
      id: sort.id,
      desc: sort.desc ?? false,
    },
  ];
}
