import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  type QuoteCreateInput,
  QuoteCreateInput as QuoteCreateInputSchema,
  QuoteDepositPercent,
  type QuoteDetail,
  QuoteDiscountPercent,
  QuoteStatus,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';
import { toAiToolJsonSchema } from './json-schema.js';

const QuoteCustomerInput = z.discriminatedUnion('type', [
  z.strictObject({
    customerId: UUID,
    type: z.literal('existing'),
  }),
  z.strictObject({
    companyName: z.string().min(1),
    type: z.literal('inline'),
  }),
]);

const QuoteSelectedAssemblyInput = z.discriminatedUnion('type', [
  z.strictObject({
    id: UUID,
    type: z.literal('existing'),
  }),
  z.strictObject({
    productAssemblyId: UUID,
    type: z.literal('catalog'),
  }),
]);

const CreateQuoteInput = z.strictObject({
  customer: QuoteCustomerInput,
  deliveryIncluded: z.boolean().default(true),
  deliveryPrice: Price.default(0),
  depositPercent: QuoteDepositPercent.default(0),
  discountPercent: QuoteDiscountPercent.default(0),
  documentNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  plannedDeliveryDate: DateOnlyIsoString.nullable().default(null),
  preferredDeliveryDate: DateOnlyIsoString.nullable().default(null),
  productId: UUID,
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
    const actorUserId = getActorUserId(ctx);
    const input: QuoteCreateInput = QuoteCreateInputSchema.parse({
      ...parsedInput,
      documentNotes: parsedInput.documentNotes ?? null,
      notes: parsedInput.notes ?? null,
      salesPersonId: parsedInput.salesPersonId ?? actorUserId,
    });

    return core.createQuote({ actorUserId, db: ctx.db, input });
  },
};

function getActorUserId(ctx: AiContext): string {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session.user.id;
}
