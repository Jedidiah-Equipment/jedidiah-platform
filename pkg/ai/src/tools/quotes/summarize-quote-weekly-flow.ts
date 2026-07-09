import * as core from '@pkg/core';
import type { AiToolBase, QuoteWeeklyFlowSummary } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

const SummarizeQuoteWeeklyFlowInput = z.strictObject({});

type SummarizeQuoteWeeklyFlowInput = z.infer<typeof SummarizeQuoteWeeklyFlowInput>;

export type SummarizeQuoteWeeklyFlowTool = AiToolBase<
  'summarizeQuoteWeeklyFlow',
  QuoteWeeklyFlowSummary,
  SummarizeQuoteWeeklyFlowInput,
  AiContext
>;

export const summarizeQuoteWeeklyFlowTool: SummarizeQuoteWeeklyFlowTool = {
  name: 'summarizeQuoteWeeklyFlow',
  inputSchema: SummarizeQuoteWeeklyFlowInput,
  jsonSchema: {
    ...toAiToolJsonSchema(SummarizeQuoteWeeklyFlowInput),
    required: [],
  },
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    SummarizeQuoteWeeklyFlowInput.parse(args ?? {});
    return core.summarizeQuoteWeeklyFlow({ db: ctx.db });
  },
};

export const summarizeQuoteWeeklyFlowDefinition: AiToolDefinition<SummarizeQuoteWeeklyFlowTool> = {
  kind: 'read',
  tool: summarizeQuoteWeeklyFlowTool,
  descriptor: {
    purpose: 'Summarize weekly Quote flow: created and accepted counts per week.',
    useWhen: ['The user asks about Quote activity trends week over week.'],
    doNotUseWhen: ['Listing individual Quotes; use listQuotes.'],
    resultIdentifiers: ['week start date', 'created count', 'accepted count'],
  },
  projectResult: identityProjection,
};
