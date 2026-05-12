import type { PagedQueryResult } from "@pkg/schema";
import { useMemo } from "react";

type PagedQueryLike<TItem> = {
  data: PagedQueryResult<TItem> | undefined;
  isLoading: boolean;
};

export function usePagedQueryResult<TItem>(query: PagedQueryLike<TItem>) {
  const emptyItems = useMemo<TItem[]>(() => [], []);

  return useMemo(
    () => ({
      items: query.data?.items ?? emptyItems,
      total: query.data?.total ?? 0,
      page: query.data?.page ?? 1,
      pageSize: query.data?.pageSize ?? 10,
      pageCount: query.data?.pageCount ?? 1,
      isLoading: query.isLoading && query.data === undefined,
    }),
    [emptyItems, query.data, query.isLoading],
  );
}
