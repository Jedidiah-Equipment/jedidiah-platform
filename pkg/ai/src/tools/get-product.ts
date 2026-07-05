import * as core from '@pkg/core';
import { type AiToolBase, type Product, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

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
