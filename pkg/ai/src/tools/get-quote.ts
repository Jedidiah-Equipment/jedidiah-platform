import * as core from '@pkg/core';
import { type AiToolBase, type QuoteDetail, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

const GetQuoteInput = z.object({
  id: UUID,
});

type GetQuoteInput = z.infer<typeof GetQuoteInput>;

export type GetQuoteTool = AiToolBase<'getQuote', QuoteDetail, GetQuoteInput, AiContext>;

export const getQuoteTool: GetQuoteTool = {
  name: 'getQuote',
  inputSchema: GetQuoteInput,
  jsonSchema: toAiToolJsonSchema(GetQuoteInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetQuoteInput.parse(args);
    return core.getQuote({ db: ctx.db, id: input.id });
  },
};
