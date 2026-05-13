import { z } from "zod";
import { Price } from "../common/price.js";
import { SortDirection } from "../common/sort.js";
import { UUID } from "../common/uuid.js";
import { createPagedQueryResult, PagedQueryInput } from "../pagination/pagination.js";

export type ProductName = z.infer<typeof ProductName>;
export const ProductName = z.string().trim().min(1, "Product name is required");

export type ProductModelCode = z.infer<typeof ProductModelCode>;
export const ProductModelCode = z.string().trim().min(1, "Model code is required");

export type ProductDescription = z.infer<typeof ProductDescription>;
export const ProductDescription = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .default(null);

export type ProductBasePrice = z.infer<typeof ProductBasePrice>;
export const ProductBasePrice = z.coerce.number().pipe(Price);

export type ProductCurrencyCode = z.infer<typeof ProductCurrencyCode>;
export const ProductCurrencyCode = z.literal("ZAR").default("ZAR");

export type Product = z.infer<typeof Product>;
export const Product = z.object({
  id: UUID,
  name: ProductName,
  description: ProductDescription,
  modelCode: ProductModelCode,
  basePrice: ProductBasePrice,
  currencyCode: ProductCurrencyCode,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ProductSortBy = z.infer<typeof ProductSortBy>;
export const ProductSortBy = z.enum(["basePrice", "createdAt", "id", "modelCode", "name"]);

export type ProductColumnFilters = z.infer<typeof ProductColumnFilters>;
export const ProductColumnFilters = z
  .object({
    id: z.string().trim().optional(),
    modelCode: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .default({});

export type ProductCreateInput = z.infer<typeof ProductCreateInput>;
export const ProductCreateInput = z.object({
  name: ProductName,
  description: ProductDescription,
  modelCode: ProductModelCode,
  basePrice: ProductBasePrice,
  currencyCode: ProductCurrencyCode,
});

export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;
export const ProductUpdateInput = z.object({
  id: UUID,
  basePrice: ProductBasePrice,
  currencyCode: ProductCurrencyCode,
  description: ProductDescription,
  modelCode: ProductModelCode,
  name: ProductName,
});

export type ProductListInput = z.infer<typeof ProductListInput>;
export const ProductListInput = PagedQueryInput.extend({
  search: z.string().trim().default(""),
  columnFilters: ProductColumnFilters,
  sortBy: ProductSortBy.default("name"),
  sortDirection: SortDirection.default("asc"),
});

export type ProductListResult = z.infer<typeof ProductListResult>;
export const ProductListResult = createPagedQueryResult(Product).extend({
  sortBy: ProductSortBy,
  sortDirection: SortDirection,
});
