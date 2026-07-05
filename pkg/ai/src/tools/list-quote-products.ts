import * as core from '@pkg/core';
import { type AiToolBase, type Logger, ProductListInput, type ProductListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListQuoteProductsTool = AiToolBase<'listQuoteProducts', ProductListResult, ProductListInput, AiContext>;

export const listQuoteProductsTool: ListQuoteProductsTool = {
  name: 'listQuoteProducts',
  inputSchema: ProductListInput,
  jsonSchema: toAiToolJsonSchema(ProductListInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return core.listProducts({ db: ctx.db, input, log: createCoreLogger(ctx.log) });
  },
};

function createCoreLogger(log: AiContext['log']): Logger {
  return {
    ai: log,
    http: log,
    root: log,
    service: log,
  } as unknown as Logger;
}
