import * as productsCore from '@pkg/core';
import { Product, ProductListInput, type ProductListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';

export type FindProductsInput = z.infer<typeof FindProductsInput>;
export const FindProductsInput = ProductListInput.pick({
  search: true,
}).strict();

const ProductLink = z.object({
  entity: z.literal('Product'),
  href: z.string(),
  label: z.string(),
});

const FindProductsItem = Product.pick({
  id: true,
  modelCode: true,
  name: true,
}).extend({ links: z.array(ProductLink) });

export type FindProductsResponse = z.infer<typeof FindProductsResponse>;
export const FindProductsResponse = z.array(FindProductsItem);

export function toCoreProductListInput(input: FindProductsInput): ProductListInput {
  return {
    page: 1,
    pageSize: 0,
    search: input.search,
    columnFilters: {},
    sortBy: 'name',
    sortDirection: 'asc',
  };
}

export function toFindProductsResponse(result: ProductListResult): FindProductsResponse {
  return result.items.map((product) => ({
    id: product.id,
    links: [{ entity: 'Product', href: `/products/${product.id}/edit`, label: product.name }],
    modelCode: product.modelCode,
    name: product.name,
  }));
}

export const findProductsDefinition = {
  name: 'findProducts',
  description: [
    'Find lightweight Product references by free-text search.',
    'Returns only the Product id, name, model code, and app link.',
    'Use this to identify the right Product; use getProduct with its id when full Product details are needed.',
    'Search matches Product name, model code, description, or UUID.',
  ].join('\n'),
  inputSchema: FindProductsInput,
  outputSchema: FindProductsResponse,
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<FindProductsResponse> {
    const input = FindProductsInput.parse(args ?? {});
    const result = await productsCore.listProducts({
      db: ctx.db,
      input: toCoreProductListInput(input),
      log: ctx.log,
    });

    return toFindProductsResponse(result);
  },
} as const;
