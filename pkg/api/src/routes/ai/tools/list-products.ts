import * as productsCore from '@pkg/core';
import { type AiToolBase, ProductListInput, type ProductListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListProductsTool = AiToolBase<'listProducts', ProductListResult, ProductListInput, AiContext>;

export const listProductsTool: ListProductsTool = {
  name: 'listProducts',
  description: 'List products with the same filters, sort, and paging available in the products page.',
  inputSchema: ProductListInput,
  jsonSchema: z.toJSONSchema(ProductListInput) as Record<string, unknown>,
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return productsCore.listProducts(ctx.db, input);
  },
};
