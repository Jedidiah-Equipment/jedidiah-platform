import * as core from '@pkg/core';
import { type AiToolBase, type Product, UUID } from '@pkg/schema';
import { z } from 'zod';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectProduct } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';
import { aiLinkMetadata } from '../tool-support.js';

const GetProductInput = z.object({
  id: UUID,
});

type GetProductInput = z.infer<typeof GetProductInput>;

export type GetProductTool = AiToolBase<'getProduct', Product, GetProductInput, AiContext>;

export const getProductTool: GetProductTool = {
  name: 'getProduct',
  inputSchema: GetProductInput,
  jsonSchema: toAiToolJsonSchema(GetProductInput),
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetProductInput.parse(args);
    return core.getProduct({ db: ctx.db, id: input.id });
  },
};

export const getProductDefinition: AiToolDefinition<GetProductTool> = {
  kind: 'read',
  tool: getProductTool,
  descriptor: {
    purpose: 'Get one Product by UUID.',
    useWhen: ['A Product id is already known and the user needs catalog details.'],
    doNotUseWhen: [
      'Searching by product name, model code, description, or partial id; use listProducts or listQuoteProducts first.',
    ],
    searchableIdentifiers: ['Product UUID'],
    resultIdentifiers: ['Product name', 'Product model code'],
    linkTarget: aiLinkMetadata.Product,
  },
  projectResult: projectProduct,
};
