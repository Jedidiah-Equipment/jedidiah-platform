import { z } from 'zod';

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
