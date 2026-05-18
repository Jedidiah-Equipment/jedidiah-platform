import * as core from '@pkg/core';
import { type AiToolBase, type Product, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

const GetProductInput = z.object({
  id: UUID,
});

type GetProductInput = z.infer<typeof GetProductInput>;

export type GetProductTool = AiToolBase<'getProduct', Product, GetProductInput, AiContext>;

export const getProductTool: GetProductTool = {
  name: 'getProduct',
  description:
    'Get one product by its UUID. Use this only after a product id is known; use listProducts first when searching by product name, model code, description, or partial id.',
  inputSchema: GetProductInput,
  jsonSchema: z.toJSONSchema(GetProductInput) as Record<string, unknown>,
  requiredPermission: 'product:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetProductInput.parse(args);
    return core.getProduct({ db: ctx.db, id: input.id });
  },
};
