import * as core from '@pkg/core';
import type { AiToolBase, QuotePipelineSummary } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

const SummarizeQuotePipelineInput = z.strictObject({});

type SummarizeQuotePipelineInput = z.infer<typeof SummarizeQuotePipelineInput>;

export type SummarizeQuotePipelineTool = AiToolBase<
  'summarizeQuotePipeline',
  QuotePipelineSummary,
  SummarizeQuotePipelineInput,
  AiContext
>;

export const summarizeQuotePipelineTool: SummarizeQuotePipelineTool = {
  name: 'summarizeQuotePipeline',
  inputSchema: SummarizeQuotePipelineInput,
  jsonSchema: {
    ...toAiToolJsonSchema(SummarizeQuotePipelineInput),
    required: [],
  },
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    SummarizeQuotePipelineInput.parse(args ?? {});
    return core.summarizeQuotePipeline({ db: ctx.db });
  },
};

export const summarizeQuotePipelineDefinition: AiToolDefinition<SummarizeQuotePipelineTool> = {
  kind: 'read',
  tool: summarizeQuotePipelineTool,
  descriptor: {
    purpose:
      'Summarize the sales pipeline: open sent count and value, newly sent and recently accepted or rejected activity.',
    useWhen: ['The user asks how the pipeline or funnel is doing.'],
    doNotUseWhen: ['Listing individual Quotes; use listQuotes.'],
    resultIdentifiers: [
      'open sent count and value',
      'newly sent value',
      'recently accepted count',
      'recently rejected count',
    ],
  },
  projectResult: identityProjection,
};
