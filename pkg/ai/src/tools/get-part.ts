import * as core from '@pkg/core';
import { type AiToolBase, type Part, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

const GetPartInput = z.object({
  id: UUID,
});

type GetPartInput = z.infer<typeof GetPartInput>;

export type GetPartTool = AiToolBase<'getPart', Part, GetPartInput, AiContext>;

export const getPartTool: GetPartTool = {
  name: 'getPart',
  inputSchema: GetPartInput,
  jsonSchema: toAiToolJsonSchema(GetPartInput),
  requiredPermission: 'part:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetPartInput.parse(args);
    return core.getPart({ db: ctx.db, id: input.id });
  },
};
