import * as productsCore from '@pkg/core';
import { Product, ProductListInput, type ProductListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';

export type ListProductsToolInput = z.infer<typeof ListProductsToolInput>;
export const ListProductsToolInput = ProductListInput.pick({
  page: true,
  pageSize: true,
  search: true,
}).strict();

const ProductLink = z.object({
  entity: z.literal('Product'),
  href: z.string(),
  label: z.string(),
});

const ListProductsToolItem = Product.pick({
  basePrice: true,
  buildTimeDays: true,
  category: true,
  createdAt: true,
  currencyCode: true,
  description: true,
  id: true,
  keyFeatures: true,
  modelCode: true,
  name: true,
  nameHighlight: true,
  range: true,
  requiresVinNumber: true,
  technicalDetails: true,
}).extend({ links: z.array(ProductLink) });

export type ListProductsToolResponse = z.infer<typeof ListProductsToolResponse>;
export const ListProductsToolResponse = z.object({
  items: z.array(ListProductsToolItem),
  total: z.number().int().nonnegative(),
});

export function toCoreListProductsInput(input: ListProductsToolInput): ProductListInput {
  return ProductListInput.parse({
    ...input,
    columnFilters: {},
    sortBy: 'name',
    sortDirection: 'asc',
  });
}

export function toListProductsToolResponse(result: ProductListResult): ListProductsToolResponse {
  return ListProductsToolResponse.parse({
    items: result.items.map((product) => ({
      basePrice: product.basePrice,
      buildTimeDays: product.buildTimeDays,
      category: product.category,
      createdAt: product.createdAt,
      currencyCode: product.currencyCode,
      description: product.description,
      id: product.id,
      keyFeatures: product.keyFeatures,
      links: [{ entity: 'Product', href: `/products/${product.id}/edit`, label: product.name }],
      modelCode: product.modelCode,
      name: product.name,
      nameHighlight: product.nameHighlight,
      range: product.range,
      requiresVinNumber: product.requiresVinNumber,
      technicalDetails: product.technicalDetails,
    })),
    total: result.total,
  });
}

export const listProductsDefinition = {
  name: 'listProducts',
  description: [
    'List Products visible to Product readers.',
    'Use when: Searching Products by free text.',
    'Free-text search matches: Product name, Product model code, description, Product UUID.',
    'Relevant result identifiers: Product name, Product model code.',
    'Links: Product records link by name.',
  ].join('\n'),
  inputSchema: ListProductsToolInput,
  outputSchema: ListProductsToolResponse,
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiV2Context): Promise<ListProductsToolResponse> {
    const input = ListProductsToolInput.parse(args ?? {});
    const result = await productsCore.listProducts({
      db: ctx.db,
      input: toCoreListProductsInput(input),
      log: ctx.log,
    });

    return toListProductsToolResponse(result);
  },
} as const;
