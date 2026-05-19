import * as core from '@pkg/core';
import { type AiToolBase, ProductListInput, type ProductListResult } from '@pkg/schema';

import { log } from '@/logger.js';

import type { AiContext } from '../ai-context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListQuoteProductsTool = AiToolBase<'listQuoteProducts', ProductListResult, ProductListInput, AiContext>;

export const listQuoteProductsTool: ListQuoteProductsTool = {
  name: 'listQuoteProducts',
  inputSchema: ProductListInput,
  jsonSchema: toAiToolJsonSchema(ProductListInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return core.listProducts({ db: ctx.db, input, log });
  },
};
