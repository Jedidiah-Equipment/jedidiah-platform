import { cursorInfiniteQueryOptions } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

import { useCursorOptions } from './use-cursor-options.js';

const QUOTE_INVENTORY_PART_PAGE_SIZE = 20;

/** The Parts catalog, searched on the server a page at a time, as a Quote editor may read it: sell prices only. */
export function useQuoteInventoryPartOptions({ enabled }: { enabled: boolean }) {
  const trpc = useTRPC();
  const { isPending: _isPending, ...options } = useCursorOptions((search) =>
    trpc.quotes.inventoryParts.infiniteQueryOptions(
      { limit: QUOTE_INVENTORY_PART_PAGE_SIZE, search },
      // No previous-data placeholder: a stale page stays pickable and would add a Part nobody searched for.
      { ...cursorInfiniteQueryOptions, enabled },
    ),
  );

  return options;
}
