import * as core from '@pkg/core';
import type { AiToolBase, QuoteStatusSummary } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

const SummarizeQuotesByStatusInput = z.strictObject({});

type SummarizeQuotesByStatusInput = z.infer<typeof SummarizeQuotesByStatusInput>;

export type SummarizeQuotesByStatusTool = AiToolBase<
  'summarizeQuotesByStatus',
  QuoteStatusSummary,
  SummarizeQuotesByStatusInput,
  AiContext
>;

export const summarizeQuotesByStatusTool: SummarizeQuotesByStatusTool = {
  name: 'summarizeQuotesByStatus',
  inputSchema: SummarizeQuotesByStatusInput,
  jsonSchema: {
    ...toAiToolJsonSchema(SummarizeQuotesByStatusInput),
    required: [],
  },
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    SummarizeQuotesByStatusInput.parse(args ?? {});
    return core.summarizeQuotesByStatus({ db: ctx.db });
  },
};

export const summarizeQuotesByStatusDefinition: AiToolDefinition<SummarizeQuotesByStatusTool> = {
  kind: 'read',
  tool: summarizeQuotesByStatusTool,
  descriptor: {
    purpose: 'Summarize Quote counts grouped by status.',
    useWhen: ['The user asks how many Quotes are in each status.'],
    doNotUseWhen: ['Listing individual Quotes; use listQuotes.'],
    resultIdentifiers: ['Quote status', 'count'],
  },
  projectResult: identityProjection,
};
