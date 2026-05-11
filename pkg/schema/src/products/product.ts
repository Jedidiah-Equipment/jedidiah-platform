import { z } from "zod";

export const ProductIdSchema = z.string().uuid();

export const ProductNameSchema = z.string().trim().min(1, "Product name is required");

export const ProductSchema = z.object({
  id: ProductIdSchema,
  name: ProductNameSchema,
});

export const ProductSortBySchema = z.enum(["id", "name"]);

export const SortDirectionSchema = z.enum(["asc", "desc"]);

export const ProductCreateInputSchema = z.object({
  name: ProductNameSchema,
});

export const ProductUpdateInputSchema = z.object({
  id: ProductIdSchema,
  name: ProductNameSchema,
});

export const ProductListInputSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: ProductSortBySchema.default("name"),
    sortDirection: SortDirectionSchema.default("asc"),
  }),
);

export const ProductListResultSchema = z.object({
  items: z.array(ProductSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  sortBy: ProductSortBySchema,
  sortDirection: SortDirectionSchema,
});

export type Product = z.infer<typeof ProductSchema>;
export type ProductCreateInput = z.infer<typeof ProductCreateInputSchema>;
export type ProductUpdateInput = z.infer<typeof ProductUpdateInputSchema>;
export type ProductListInput = z.infer<typeof ProductListInputSchema>;
export type ProductListResult = z.infer<typeof ProductListResultSchema>;
export type ProductSortBy = z.infer<typeof ProductSortBySchema>;
export type SortDirection = z.infer<typeof SortDirectionSchema>;
