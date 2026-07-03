import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  type QuoteCreateInput,
  QuoteCreateInput as QuoteCreateInputSchema,
  QuoteCustomerInput,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteLineItemInput,
  QuoteOfferingInput,
  QuoteSelectedAssemblyInput,
  QuoteStatus,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';
import { requireActorSession } from './actor.js';
import { toAiToolJsonSchema } from './json-schema.js';

const CreateQuoteInput = z.strictObject({
  customer: QuoteCustomerInput,
  deliveryIncluded: z.boolean().default(true),
  deliveryPrice: Price.default(0),
  depositPercent: QuoteDepositPercent.default(0),
  discountPercent: QuoteDiscountPercent.default(0),
  documentNotes: z.string().nullable().optional(),
  lineItems: z.array(QuoteLineItemInput).default([]),
  notes: z.string().nullable().optional(),
  offering: QuoteOfferingInput,
  plannedDeliveryDate: DateOnlyIsoString.nullable().default(null),
  preferredDeliveryDate: DateOnlyIsoString.nullable().default(null),
  salesPersonId: AuthId.optional(),
  selectedAssemblies: z.array(QuoteSelectedAssemblyInput).default([]),
  status: QuoteStatus.default('draft'),
  validUntil: DateIsoString.nullable().default(null),
});

type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;

export type CreateQuoteTool = AiToolBase<'createQuote', QuoteDetail, CreateQuoteInput, AiContext>;

export const createQuoteTool: CreateQuoteTool = {
  name: 'createQuote',
  inputSchema: CreateQuoteInput,
  jsonSchema: toAiToolJsonSchema(CreateQuoteInput),
  requiredPermission: 'quote:create',
  async handler(args: unknown, ctx: AiContext) {
    const parsedInput = CreateQuoteInput.parse(args);
    const actorUserId = requireActorSession(ctx).user.id;
    const input: QuoteCreateInput = QuoteCreateInputSchema.parse({
      ...parsedInput,
      documentNotes: parsedInput.documentNotes ?? null,
      notes: parsedInput.notes ?? null,
      salesPersonId: parsedInput.salesPersonId ?? actorUserId,
    });

    return core.createQuote({ actorUserId, db: ctx.db, input });
  },
};
