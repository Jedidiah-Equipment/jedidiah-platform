import * as productsCore from '@pkg/core';
import { type AiToolBase, ProductListInput, type ProductListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListProductsTool = AiToolBase<'listProducts', ProductListResult, ProductListInput, AiContext>;

export const listProductsTool: ListProductsTool = {
  name: 'listProducts',
  description:
    'List products. Prefer specific queries over broad catalog scans: use columnFilters.id when a product id is known, columnFilters.modelCode for a model code, and columnFilters.name for a product name. Use search for exploratory text matches across product id, name, model code, and description. Use sortBy, sortDirection, page, and pageSize to return the right product slice.',
  inputSchema: ProductListInput,
  jsonSchema: z.toJSONSchema(ProductListInput) as Record<string, unknown>,
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return productsCore.listProducts({ database: ctx.db, input });
  },
};
