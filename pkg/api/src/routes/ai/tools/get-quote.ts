import * as core from '@pkg/core';
import { type AiToolBase, type QuoteDetail, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

const GetQuoteInput = z.object({
  id: UUID,
});

type GetQuoteInput = z.infer<typeof GetQuoteInput>;

export type GetQuoteTool = AiToolBase<'getQuote', QuoteDetail, GetQuoteInput, AiContext>;

export const getQuoteTool: GetQuoteTool = {
  name: 'getQuote',
  inputSchema: GetQuoteInput,
  jsonSchema: z.toJSONSchema(GetQuoteInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetQuoteInput.parse(args);
    return core.getQuote({ db: ctx.db, id: input.id });
  },
};
