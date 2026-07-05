import * as core from '@pkg/core';
import { type AiToolBase, QuoteListInput, type QuoteListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectPagedItems, projectQuote } from '../projections.js';

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

export const listQuotesDefinition: AiToolDefinition<ListQuotesTool> = {
  kind: 'read',
  tool: listQuotesTool,
  descriptor: {
    purpose: 'List Quotes visible to Quote readers.',
    useWhen: [
      'Searching by Quote Code, Customer company name, Product name, Custom Work Title, Product model code, linked Job Codes, UUID, Quote Kind, or Quote Status.',
      'Traversing from Customer to Job through Quotes.',
    ],
    doNotUseWhen: ['The user needs full details for one Quote; call getQuote after identifying the Quote id.'],
    searchableIdentifiers: [
      'Quote UUID',
      'Quote Code such as QUO-00001',
      'Customer company name',
      'Custom Work Title',
      'Quote Kind',
      'Product name',
      'linked Job Codes',
      'Quote Status',
    ],
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
      'linked Job UUIDs',
    ],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: (result) => projectPagedItems(result, projectQuote),
};
