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
  description:
    'Get one quote by its UUID. Use this only after a quote id is known; use listQuotes first when searching by QUO-00001-style code, customer, product, linked job code, or partial id.',
  inputSchema: GetQuoteInput,
  jsonSchema: z.toJSONSchema(GetQuoteInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = GetQuoteInput.parse(args);
    return core.getQuote({ db: ctx.db, id: input.id });
  },
};
