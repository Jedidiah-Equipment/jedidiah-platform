import * as core from '@pkg/core';
import { type AiToolBase, QuoteListInput, type QuoteListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectPagedItems, projectQuoteListItem } from '../projections.js';

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
      'Searching Quotes by free text or filtering by status, kind, Customer, Product, or salesperson.',
      'Traversing from Customer to Job through Quotes.',
    ],
    searchableIdentifiers: [
      'Quote Code (QUO- prefix ok)',
      'Customer company name',
      'Custom Work Title',
      'Product name',
      'Product model code',
      'linked Job Codes (JOB- prefix ok)',
      'Quote UUID',
      'use filters for status, kind, customerId, productId, salesPersonId',
    ],
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
      'linked Job Codes',
      'linked Job UUIDs',
    ],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: (result) => projectPagedItems(result, projectQuoteListItem),
};
