import * as quotesCore from '@pkg/core/equipment';
import { quoteKindLabels } from '@pkg/domain/equipment';
import { type UserAccessSummary, UUID } from '@pkg/schema';
import type { QuoteDetail } from '@pkg/schema/equipment';
import { z } from 'zod';

import type { AiContext } from '@/equipment/context.js';
import {
  QuoteDetailResponse as SharedQuoteDetailResponse,
  type QuoteDetailResponse as SharedQuoteDetailResponseType,
  toQuoteDetailResponse,
} from '@/equipment/tools/quotes/quote-response.js';

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
    `Get the full details for one Product Quote or ${quoteKindLabels.custom} Quote by UUID.`,
    'Use after findQuotes identifies the Quote the user means.',
    'Returns pricing, status, dates, Customer and offering details, selected assemblies, Work Items, and relationship links without thumbnail data.',
  ].join('\n'),
  inputSchema: GetQuoteInput,
  outputSchema: GetQuoteResponse,
  anyOfPermissions: ['equipment_quote:read'],
  async handler(args: unknown, ctx: AiContext): Promise<GetQuoteResponse> {
    const input = GetQuoteInput.parse(args);
    const quote = await quotesCore.getQuote({ db: ctx.db, id: input.id });
    return toGetQuoteResponse(quote, ctx.access);
  },
} as const;
