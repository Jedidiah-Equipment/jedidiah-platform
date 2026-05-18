import * as core from '@pkg/core';
import { type AiToolBase, QuoteListInput, type QuoteListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListQuotesTool = AiToolBase<'listQuotes', QuoteListResult, QuoteListInput, AiContext>;

export const listQuotesTool: ListQuotesTool = {
  name: 'listQuotes',
  description:
    'List quotes. Use filters.statuses to choose draft, sent, accepted, rejected, or an empty array for all statuses. Use search for quote UUIDs, partial UUIDs, customer company names, product names, product model codes, quote codes such as QUO-00001, or linked job codes such as JOB-00001. Use sortBy, sortDirection, page, and pageSize to return the right quote slice.',
  inputSchema: QuoteListInput,
  jsonSchema: z.toJSONSchema(QuoteListInput) as Record<string, unknown>,
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = QuoteListInput.parse(args ?? {});
    return core.listQuotes({ db: ctx.db, input });
  },
};
