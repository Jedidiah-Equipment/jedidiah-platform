import * as core from '@pkg/core';
import { type AiToolBase, type QuoteDetail, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectQuoteDetail } from '../projections.js';

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

export const getQuoteDefinition: AiToolDefinition<GetQuoteTool> = {
  kind: 'read',
  tool: getQuoteTool,
  descriptor: {
    purpose: 'Get one Quote by UUID.',
    resultIdentifiers: [
      'Quote Code',
      'Quote Kind',
      'Quote Status',
      'Document Notes',
      'Preferred delivery date',
      'Planned delivery date',
      'Customer company name',
      'Product name / Custom Work Title',
      'quoted price and currency',
      'Quote Line Items',
      'Selected Assemblies',
      'linked Job Codes',
    ],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: projectQuoteDetail,
};
