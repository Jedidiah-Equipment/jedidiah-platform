import * as core from '@pkg/core';
import { type AiToolBase, PartListInput, type PartListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListPartsTool = AiToolBase<'listParts', PartListResult, PartListInput, AiContext>;

export const listPartsTool: ListPartsTool = {
  name: 'listParts',
  inputSchema: PartListInput,
  jsonSchema: toAiToolJsonSchema(PartListInput),
  requiredPermission: 'part:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = PartListInput.parse(args ?? {});
    return core.listParts({ db: ctx.db, input });
  },
};
