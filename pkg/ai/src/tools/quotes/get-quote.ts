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
    useWhen: ['A Quote id is already known and the user needs Quote commercial details or linked Job details.'],
    doNotUseWhen: [
      'Searching by Quote Code, Customer, Product, Custom Work Title, linked Job Codes, or partial id; use listQuotes first.',
    ],
    searchableIdentifiers: ['Quote UUID'],
    resultIdentifiers: [
      'Quote Code',
      'Quote Kind',
      'Quote Status',
      'Document Notes',
      'Preferred delivery date',
      'Planned delivery date',
      'Product UUID and nested product facts (name, modelCode, buildTimeDays, currencyCode) when this is a Product Quote; product is null for Custom Quotes or unresolved Product projections',
      'Work Title display fallback when this is a Custom Quote',
      'salesPersonId User ID',
      'quotedBasePrice and quotedCurrencyCode: latched from Product for Product Quotes; entered base price in ZAR for Custom Quotes',
      'Quote Line Items quantity x unit price contribution',
      'Selected Assemblies for Product Quotes; empty for Custom Quotes',
      'Customer company name',
      'linked Job Codes',
    ],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: projectQuoteDetail,
};
