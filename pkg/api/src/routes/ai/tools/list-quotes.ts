import * as core from '@pkg/core';
import { type AiToolBase, QuoteListInput, type QuoteListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListQuotesTool = AiToolBase<'listQuotes', QuoteListResult, QuoteListInput, AiContext>;

export const listQuotesTool: ListQuotesTool = {
  name: 'listQuotes',
  inputSchema: QuoteListInput,
  jsonSchema: z.toJSONSchema(QuoteListInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = QuoteListInput.parse(args ?? {});
    return core.listQuotes({ db: ctx.db, input });
  },
};
