import * as productsCore from '@pkg/core';
import { Product, ProductListInput, type ProductListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import { createProductAppHref, InternalAppHref } from '@/v2/entity-links.js';

export type FindProductsInput = z.infer<typeof FindProductsInput>;
export const FindProductsInput = ProductListInput.pick({
  search: true,
}).strict();

const FindProductsItem = Product.pick({
  id: true,
  modelCode: true,
  name: true,
}).extend({ links: z.object({ app: InternalAppHref }) });

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
    links: { app: createProductAppHref(product.id) },
    modelCode: product.modelCode,
    name: product.name,
  }));
}

export const findProductsDefinition = {
  name: 'findProducts',
  description: [
    'Search for Products by name, model code, description, or UUID.',
    'Returns lightweight matches containing only the Product id, name, model code, and app link.',
    'This tool does not return full Product details. Call getProduct with the selected id when those details are needed.',
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
