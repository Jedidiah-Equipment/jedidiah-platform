import * as core from '@pkg/core';
import { type AiToolBase, QuoteListInput, type QuoteListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListQuotesTool = AiToolBase<'listQuotes', QuoteListResult, QuoteListInput, AiContext>;

export const listQuotesTool: ListQuotesTool = {
  name: 'listQuotes',
  inputSchema: QuoteListInput,
  jsonSchema: toAiToolJsonSchema(QuoteListInput),
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = QuoteListInput.parse(args ?? {});
    return core.listQuotes({ db: ctx.db, input });
  },
};
