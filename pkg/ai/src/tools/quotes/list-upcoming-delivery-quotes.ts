import * as core from '@pkg/core';
import type { AiToolBase, UpcomingDeliveryQuotesResult } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectUpcomingDeliveryQuotes } from '../projections.js';

const ListUpcomingDeliveryQuotesInput = z.strictObject({});

type ListUpcomingDeliveryQuotesInput = z.infer<typeof ListUpcomingDeliveryQuotesInput>;

export type ListUpcomingDeliveryQuotesTool = AiToolBase<
  'listUpcomingDeliveryQuotes',
  UpcomingDeliveryQuotesResult,
  ListUpcomingDeliveryQuotesInput,
  AiContext
>;

export const listUpcomingDeliveryQuotesTool: ListUpcomingDeliveryQuotesTool = {
  name: 'listUpcomingDeliveryQuotes',
  inputSchema: ListUpcomingDeliveryQuotesInput,
  jsonSchema: {
    ...toAiToolJsonSchema(ListUpcomingDeliveryQuotesInput),
    required: [],
  },
  requiredPermission: 'quote:read',
  async handler(args: unknown, ctx: AiContext) {
    ListUpcomingDeliveryQuotesInput.parse(args ?? {});
    return core.listUpcomingDeliveryQuotes({ db: ctx.db });
  },
};

export const listUpcomingDeliveryQuotesDefinition: AiToolDefinition<ListUpcomingDeliveryQuotesTool> = {
  kind: 'read',
  tool: listUpcomingDeliveryQuotesTool,
  descriptor: {
    purpose: 'List Quotes with a planned delivery due inside the upcoming delivery window.',
    useWhen: ['The user asks what is due for delivery or coming up for delivery soon.'],
    doNotUseWhen: ['Searching or filtering Quotes generally; use listQuotes.'],
    resultIdentifiers: [
      'Quote Code',
      'Customer company name',
      'planned delivery date',
      'preferred delivery date',
      'quoted price and currency',
    ],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: projectUpcomingDeliveryQuotes,
};
