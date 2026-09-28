import { cursorInfiniteQueryOptions } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

import { useCursorOptions } from './use-cursor-options.js';

const PART_SEARCH_PAGE_SIZE = 20;

/** The whole Parts catalog, searched on the server a page at a time. */
export function usePartSearchOptions({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();

  return useCursorOptions((search) =>
    trpc.parts.list.infiniteQueryOptions(
      { columnFilters: {}, limit: PART_SEARCH_PAGE_SIZE, search, sortBy: 'code', sortDirection: 'asc' },
      { ...cursorInfiniteQueryOptions, enabled },
    ),
  );
}
