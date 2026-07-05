import * as productsCore from '@pkg/core';
import { type AiToolBase, type Logger, ProductListInput, type ProductListResult } from '@pkg/schema';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectPagedItems, projectProduct } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';
import { aiLinkMetadata } from '../tool-support.js';

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

export const listProductsDefinition: AiToolDefinition<ListProductsTool> = {
  kind: 'read',
  tool: listProductsTool,
  descriptor: {
    purpose: 'List Products visible to Product readers.',
    useWhen: ['Searching by Product name, model code, description, UUID, or partial text.'],
    doNotUseWhen: ['The caller only has quote access; use listQuoteProducts for quote-reader Product lookup.'],
    searchableIdentifiers: ['Product UUID', 'Product name', 'model code', 'description'],
    resultIdentifiers: ['Product name', 'Product model code'],
    linkTarget: aiLinkMetadata.Product,
  },
  projectResult: (result) => projectPagedItems(result, projectProduct),
};
