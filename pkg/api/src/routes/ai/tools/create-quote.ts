import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  type QuoteCreateInput,
  QuoteCreateInput as QuoteCreateInputSchema,
  type QuoteDetail,
} from '@pkg/schema';
import type { z } from 'zod';

import type { AiContext } from '../ai-context.js';
import { requireActorSession } from './actor.js';
import { toAiToolJsonSchema } from './json-schema.js';

const CreateQuoteInput = QuoteCreateInputSchema.omit({
  documentNotes: true,
  notes: true,
  plannedDeliveryDate: true,
  preferredDeliveryDate: true,
  salesPersonId: true,
  status: true,
  validUntil: true,
})
  .extend({
    documentNotes: QuoteCreateInputSchema.shape.documentNotes.optional(),
    notes: QuoteCreateInputSchema.shape.notes.optional(),
    plannedDeliveryDate: DateOnlyIsoString.nullable().default(null),
    preferredDeliveryDate: DateOnlyIsoString.nullable().default(null),
    salesPersonId: AuthId.optional(),
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
