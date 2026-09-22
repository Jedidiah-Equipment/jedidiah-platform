import type { JobStockMovementType } from '@pkg/schema/equipment';
import { keepPreviousData } from '@tanstack/react-query';

import { cursorInfiniteQueryOptions } from '@/components/data-table/cursor-query.js';
import { useTRPC } from '@/lib/trpc.js';

import { useCursorOptions } from './use-cursor-options.js';

const QUOTE_OPTION_PAGE_SIZE = 20;

/** The Parts Sales a stock movement may target, read through inventory so a price-blind role can pick one. */
export function useInventoryQuotePicker({
  enabled,
  movementType,
}: {
  enabled: boolean;
  movementType: JobStockMovementType;
}) {
  const trpc = useTRPC();

  return useCursorOptions((search) =>
    trpc.inventoryQuotes.quoteOptions.infiniteQueryOptions(
      { limit: QUOTE_OPTION_PAGE_SIZE, movementType, search },
      { ...cursorInfiniteQueryOptions, enabled, placeholderData: keepPreviousData },
    ),
  );
}

export type InventoryQuotePickerController = ReturnType<typeof useInventoryQuotePicker>;
