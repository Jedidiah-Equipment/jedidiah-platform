import * as productsCore from '@pkg/core';
import { type AiToolBase, ProductListInput, type ProductListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectPagedItems, projectProductListItem } from '../projections.js';

export type ListProductsTool = AiToolBase<'listProducts', ProductListResult, ProductListInput, AiContext>;

export const listProductsTool: ListProductsTool = {
  name: 'listProducts',
  inputSchema: ProductListInput,
  jsonSchema: toAiToolJsonSchema(ProductListInput),
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});
    return productsCore.listProducts({ db: ctx.db, input, log: ctx.log });
  },
};

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
  projectResult: (result) => projectPagedItems(result, projectProductListItem),
};
