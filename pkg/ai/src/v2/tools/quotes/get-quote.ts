import * as quotesCore from '@pkg/core';
import { type QuoteDetail, type UserAccessSummary, UUID } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';
import {
  QuoteDetailResponse as SharedQuoteDetailResponse,
  type QuoteDetailResponse as SharedQuoteDetailResponseType,
  toQuoteDetailResponse,
} from '@/v2/tools/quotes/quote-response.js';

export type GetQuoteInput = z.infer<typeof GetQuoteInput>;
export const GetQuoteInput = z.object({ id: UUID }).strict();

export type GetQuoteResponse = SharedQuoteDetailResponseType;
export const GetQuoteResponse = SharedQuoteDetailResponse;

export function toGetQuoteResponse(quote: QuoteDetail, access: UserAccessSummary | null): GetQuoteResponse {
  return toQuoteDetailResponse(quote, access);
}

export const getQuoteDefinition = {
  name: 'getQuote',
  description: [
    'Get the full details for one Product Quote or Custom Quote by UUID.',
    'Use after findQuotes identifies the Quote the user means.',
    'Returns pricing, status, dates, Customer and offering details, line items, selected assemblies, and relationship links without thumbnail data.',
  ].join('\n'),
  inputSchema: GetQuoteInput,
  outputSchema: GetQuoteResponse,
  anyOfPermissions: ['quote:read'],
  async handler(args: unknown, ctx: AiV2Context): Promise<GetQuoteResponse> {
    const input = GetQuoteInput.parse(args);
    const quote = await quotesCore.getQuote({ db: ctx.db, id: input.id });
    return toGetQuoteResponse(quote, ctx.access);
  },
} as const;
