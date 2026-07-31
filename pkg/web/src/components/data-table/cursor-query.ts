import { useMemo } from 'react';

type CursorPage<TItem> = {
  items: TItem[];
  nextCursor: number | null;
  total: number;
};

export const cursorInfiniteQueryOptions = {
  getNextPageParam: (page: Pick<CursorPage<unknown>, 'nextCursor'>) => page.nextCursor,
  initialCursor: 0,
};

export function useCombinedCursorQueryPages<TItem>(pages: CursorPage<TItem>[] | undefined) {
  return useMemo(
    () => ({
      items: pages?.flatMap((page) => page.items) ?? [],
      total: pages?.at(-1)?.total ?? 0,
    }),
    [pages],
  );
}
