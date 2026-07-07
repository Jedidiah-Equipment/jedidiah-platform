import * as core from '@pkg/core';
import { type AiToolBase, ProductListInput, type ProductListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectPagedItems, projectProductListItem } from '../projections.js';

export type ListQuoteProductsTool = AiToolBase<'listQuoteProducts', ProductListResult, ProductListInput, AiContext>;

export const listQuoteProductsTool: ListQuoteProductsTool = {
  name: 'listQuoteProducts',
  inputSchema: ProductListInput,
  jsonSchema: toAiToolJsonSchema(ProductListInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return core.listProducts({ db: ctx.db, input, log: ctx.log });
  },
};

export const listQuoteProductsDefinition: AiToolDefinition<ListQuoteProductsTool> = {
  kind: 'read',
  tool: listQuoteProductsTool,
  descriptor: {
    purpose: 'List Products available to Quote readers.',
    useWhen: ['A quote-reader needs to find a Product by name, model code, description, UUID, or partial text.'],
    doNotUseWhen: ['The user needs Product-only catalog workflows outside quoting.'],
    searchableIdentifiers: ['Product UUID', 'Product name', 'model code', 'description'],
    resultIdentifiers: ['Product name', 'Product model code'],
    linkTarget: aiLinkMetadata.Product,
  },
  projectResult: (result) => projectPagedItems(result, projectProductListItem),
};
