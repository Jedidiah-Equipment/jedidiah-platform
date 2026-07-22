import * as quotesCore from '@pkg/core';
import {
  AuthId,
  QuotePatchInput as CoreQuotePatchInput,
  type QuotePatchInput as CoreQuotePatchInputType,
  DateIsoString,
  DateOnlyIsoString,
  QuoteCancellationReason,
  type QuoteDetail,
  QuoteDocumentNotes,
  QuoteNotes,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
  type UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiActorId } from '@/actor.js';
import type { AiContext } from '@/context.js';
import {
  QuoteDetailResponse as SharedQuoteDetailResponse,
  type QuoteDetailResponse as SharedQuoteDetailResponseType,
  toQuoteDetailResponse,
} from '@/tools/quotes/quote-response.js';

// Provider tool schemas are JSON-only, so compose non-transforming schema leaves and normalize in the mapper.
export type PatchQuoteInput = z.infer<typeof PatchQuoteInput>;
export const PatchQuoteInput = z
  .object({
    cancellationReason: QuoteCancellationReason.optional().describe(
      'Required together with status=cancelled; explain why the Quote is being cancelled.',
    ),
    documentNotes: QuoteDocumentNotes.optional(),
    id: UUID,
    notes: QuoteNotes.optional(),
    plannedDeliveryDate: DateOnlyIsoString.nullable().optional(),
    preferredDeliveryDate: DateOnlyIsoString.nullable().optional(),
    salesPersonId: AuthId.optional(),
    selectedAssemblies: z
      .array(QuoteSelectedAssemblyInput)
      .optional()
      .describe('Complete replacement selection. Omit to keep current assemblies; use [] to clear them.'),
    status: QuoteStatus.optional(),
    validUntil: DateIsoString.nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.status === 'cancelled' && input.cancellationReason === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Cancellation reason is required',
        path: ['cancellationReason'],
      });
    } else if (input.status !== 'cancelled' && input.cancellationReason !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Cancellation reason is only allowed when cancelling a quote',
        path: ['cancellationReason'],
      });
    }
  });

export type PatchQuoteResponse = SharedQuoteDetailResponseType;
export const PatchQuoteResponse = SharedQuoteDetailResponse;

export function toCoreQuotePatchInput(input: PatchQuoteInput): CoreQuotePatchInputType {
  return CoreQuotePatchInput.parse(input);
}

export function toPatchQuoteResponse(quote: QuoteDetail, access: UserAccessSummary | null): PatchQuoteResponse {
  return toQuoteDetailResponse(quote, access);
}

export const patchQuoteDefinition = {
  name: 'patchQuote',
  description: [
    'Patch one Quote, changing only explicitly provided fields: status, salesperson, delivery dates, valid-until, notes, or selected assemblies.',
    'Use findQuotes first when the Quote UUID is not already known.',
    'Do not change status to accepted or rejected unless the user explicitly requested that exact decision.',
    'Changing status to cancelled requires cancellationReason in the same call.',
    'When selectedAssemblies are provided, they replace the complete collection; use getQuote first to preserve entries the user did not ask to remove.',
    'Offering and quote-level pricing fields remain excluded and must be edited in the Quote form.',
    'Omitted fields remain unchanged; null clears a nullable date or note.',
  ].join('\n'),
  inputSchema: PatchQuoteInput,
  outputSchema: PatchQuoteResponse,
  anyOfPermissions: ['quote:update'],
  async handler(args: unknown, ctx: AiContext): Promise<PatchQuoteResponse> {
    const input = toCoreQuotePatchInput(PatchQuoteInput.parse(args));
    const quote = await quotesCore.patchQuote({
      actorUserId: requireAiActorId(ctx),
      db: ctx.db,
      input,
    });
    return toPatchQuoteResponse(quote, ctx.access);
  },
} as const;
