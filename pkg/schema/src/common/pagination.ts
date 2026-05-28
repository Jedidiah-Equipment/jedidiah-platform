import { z } from 'zod';

import { SortDirection } from './sort.js';
import { SearchText } from './text.js';

export type PagedQueryInput = z.infer<typeof PagedQueryInput>;
export const PagedQueryInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(0).max(100).default(10),
});

export type PagedQueryResult<TItem> = {
  items: TItem[];
  total: number;
};

export function createPagedQueryResult<ItemSchema extends z.ZodType>(itemSchema: ItemSchema) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
  });
}

export function createSortedPagedQueryInput<
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
  return PagedQueryInput.extend({
    ...shape,
    sortBy,
    sortDirection: SortDirection.default(defaultSortDirection),
  });
}

export function createSearchedSortedPagedQueryInput<
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
  return createSortedPagedQueryInput({
    defaultSortDirection,
    shape: {
      ...shape,
      search: SearchText,
    },
    sortBy,
  });
}

export function createSortedPagedQueryResult<ItemSchema extends z.ZodType, SortBySchema extends z.ZodEnum>(
  itemSchema: ItemSchema,
  sortBy: SortBySchema,
) {
  return createPagedQueryResult(itemSchema).extend({
    sortBy,
    sortDirection: SortDirection,
  });
}
