import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  type QuoteCreateInput,
  QuoteCreateInput as QuoteCreateInputSchema,
  type QuoteDetail,
  QuoteWorkTitle,
  requiredTrimmedText,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { requireActorSession } from './actor.js';
import { toAiToolJsonSchema } from './json-schema.js';

const CreateQuoteCustomerInput = z
  .object({
    companyName: requiredTrimmedText('Company name is required').optional(),
    customerId: UUID.optional(),
    type: z.enum(['existing', 'inline']),
  })
  .strict();

const CreateQuoteOfferingInput = z
  .object({
    basePrice: z.coerce.number().pipe(Price).optional(),
    kind: z.enum(['product', 'custom']),
    productId: UUID.optional(),
    workTitle: QuoteWorkTitle.optional(),
  })
  .strict();

const CreateQuoteSelectedAssemblyInput = z
  .object({
    id: UUID.optional(),
    productAssemblyId: UUID.optional(),
    type: z.enum(['existing', 'catalog']),
  })
  .strict();

const CreateQuoteInput = QuoteCreateInputSchema.omit({
  customer: true,
  documentNotes: true,
  notes: true,
  offering: true,
  plannedDeliveryDate: true,
  preferredDeliveryDate: true,
  salesPersonId: true,
  selectedAssemblies: true,
  status: true,
  validUntil: true,
})
  .extend({
    customer: CreateQuoteCustomerInput,
    documentNotes: QuoteCreateInputSchema.shape.documentNotes.optional(),
    notes: QuoteCreateInputSchema.shape.notes.optional(),
    offering: CreateQuoteOfferingInput,
    plannedDeliveryDate: DateOnlyIsoString.nullable().default(null),
    preferredDeliveryDate: DateOnlyIsoString.nullable().default(null),
    salesPersonId: AuthId.optional(),
    selectedAssemblies: z.array(CreateQuoteSelectedAssemblyInput).default([]),
    status: QuoteCreateInputSchema.shape.status.default('draft'),
    validUntil: DateIsoString.nullable().default(null),
  })
  .strict();

type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;

export type CreateQuoteTool = AiToolBase<'createQuote', QuoteDetail, CreateQuoteInput, AiContext>;

export const createQuoteTool: CreateQuoteTool = {
  name: 'createQuote',
  inputSchema: CreateQuoteInput,
  jsonSchema: toAiToolJsonSchema(CreateQuoteInput, { io: 'input' }),
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
