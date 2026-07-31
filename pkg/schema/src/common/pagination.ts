import { z } from 'zod';

import { SortDirection } from './sort.js';
import { SearchText } from './text.js';

export type CursorQueryInput = z.infer<typeof CursorQueryInput>;
export const CursorQueryInput = z.object({
  // Coercion intentionally accepts tRPC's null initial pageParam as the first offset.
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(0).max(100).default(10),
});

export type CursorQueryResult<TItem> = {
  items: TItem[];
  nextCursor: number | null;
  total: number;
};

export function createCursorQueryResult<ItemSchema extends z.ZodType>(itemSchema: ItemSchema) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.number().int().nonnegative().nullable(),
    total: z.number().int().nonnegative(),
  });
}

export function getNextCursor({
  count,
  cursor,
  total,
}: {
  count: number;
  cursor: number;
  total: number;
}): number | null {
  // An empty result for a stale cursor must terminate instead of repeating forever.
  return count > 0 && cursor + count < total ? cursor + count : null;
}

export function createSortedCursorQueryInput<
  SortBySchema extends z.ZodType,
  Shape extends z.core.$ZodLooseShape = Record<string, never>,
>({
  defaultSortDirection = 'asc',
  shape,
  sortBy,
}: {
  defaultSortDirection?: z.infer<typeof SortDirection>;
  shape: Shape;
  sortBy: SortBySchema;
}) {
  return CursorQueryInput.extend({
    ...shape,
    sortBy,
    sortDirection: SortDirection.default(defaultSortDirection),
  });
}

export function createSearchedSortedCursorQueryInput<
  SortBySchema extends z.ZodType,
  Shape extends z.core.$ZodLooseShape = Record<string, never>,
>({
  defaultSortDirection = 'asc',
  shape,
  sortBy,
}: {
  defaultSortDirection?: z.infer<typeof SortDirection>;
  shape: Shape;
  sortBy: SortBySchema;
}) {
  return createSortedCursorQueryInput({
    defaultSortDirection,
    shape: {
      ...shape,
      search: SearchText,
    },
    sortBy,
  });
}
