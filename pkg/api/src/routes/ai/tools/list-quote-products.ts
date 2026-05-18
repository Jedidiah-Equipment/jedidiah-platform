import * as core from '@pkg/core';
import { type AiToolBase, ProductListInput, type ProductListResult } from '@pkg/schema';
import { z } from 'zod';

import { log } from '@/logger.js';

import type { AiContext } from '../ai-context.js';

export type ListQuoteProductsTool = AiToolBase<'listQuoteProducts', ProductListResult, ProductListInput, AiContext>;

export const listQuoteProductsTool: ListQuoteProductsTool = {
  name: 'listQuoteProducts',
  description:
    'List products available to quote readers. Prefer specific queries over broad catalog scans: use columnFilters.id when a product id is known, columnFilters.modelCode for a model code, and columnFilters.name for a product name. Use search for exploratory text matches across product id, name, model code, and description. Use sortBy, sortDirection, page, and pageSize to return the right product slice.',
  inputSchema: ProductListInput,
  jsonSchema: z.toJSONSchema(ProductListInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return core.listProducts({ db: ctx.db, input, log });
  },
};
