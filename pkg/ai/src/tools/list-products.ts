import * as productsCore from '@pkg/core';
import { type AiToolBase, type Logger, ProductListInput, type ProductListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListProductsTool = AiToolBase<'listProducts', ProductListResult, ProductListInput, AiContext>;

export const listProductsTool: ListProductsTool = {
  name: 'listProducts',
  inputSchema: ProductListInput,
  jsonSchema: toAiToolJsonSchema(ProductListInput),
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return productsCore.listProducts({ db: ctx.db, input, log: createCoreLogger(ctx.log) });
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
