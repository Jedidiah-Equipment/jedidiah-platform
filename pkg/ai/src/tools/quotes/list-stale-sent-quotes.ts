import * as core from '@pkg/core';
import type { AiToolBase, StaleSentQuoteList } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectStaleSentQuotes } from '../projections.js';

const ListStaleSentQuotesInput = z.strictObject({});

type ListStaleSentQuotesInput = z.infer<typeof ListStaleSentQuotesInput>;

export type ListStaleSentQuotesTool = AiToolBase<
  'listStaleSentQuotes',
  StaleSentQuoteList,
  ListStaleSentQuotesInput,
  AiContext
>;

export const listStaleSentQuotesTool: ListStaleSentQuotesTool = {
  name: 'listStaleSentQuotes',
  inputSchema: ListStaleSentQuotesInput,
  jsonSchema: {
    ...toAiToolJsonSchema(ListStaleSentQuotesInput),
    required: [],
  },
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    ListStaleSentQuotesInput.parse(args ?? {});
    return core.listStaleSentQuotes({ db: ctx.db });
  },
};

export const listStaleSentQuotesDefinition: AiToolDefinition<ListStaleSentQuotesTool> = {
  kind: 'read',
  tool: listStaleSentQuotesTool,
  descriptor: {
    purpose: 'List sent Quotes that have gone stale and need follow-up.',
    useWhen: ['The user asks which Quotes went quiet or need chasing.'],
    doNotUseWhen: ['Searching or filtering Quotes generally; use listQuotes.'],
    resultIdentifiers: ['Quote Code', 'Customer company name', 'days since sent', 'total value'],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: projectStaleSentQuotes,
};
