import { z } from "zod";

export type ProductId = z.infer<typeof ProductId>;
export const ProductId = z.string().uuid();

export type ProductName = z.infer<typeof ProductName>;
export const ProductName = z.string().trim().min(1, "Product name is required");

export type Product = z.infer<typeof Product>;
export const Product = z.object({
  id: ProductId,
  name: ProductName,
});

export type ProductSortBy = z.infer<typeof ProductSortBy>;
export const ProductSortBy = z.enum(["id", "name"]);

export type SortDirection = z.infer<typeof SortDirection>;
export const SortDirection = z.enum(["asc", "desc"]);

export type ProductColumnFilters = z.infer<typeof ProductColumnFilters>;
export const ProductColumnFilters = z
  .object({
    id: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .default({});

export type ProductCreateInput = z.infer<typeof ProductCreateInput>;
export const ProductCreateInput = z.object({
  name: ProductName,
});

export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;
export const ProductUpdateInput = z.object({
  id: ProductId,
  name: ProductName,
});

export type ProductListInput = z.infer<typeof ProductListInput>;
export const ProductListInput = z.preprocess(
  (value) => value ?? {},
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    columnFilters: ProductColumnFilters,
    sortBy: ProductSortBy.default("name"),
    sortDirection: SortDirection.default("asc"),
  }),
);

export type ProductListResult = z.infer<typeof ProductListResult>;
export const ProductListResult = z.object({
  items: z.array(Product),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  sortBy: ProductSortBy,
  sortDirection: SortDirection,
});
