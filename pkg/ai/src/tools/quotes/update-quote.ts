import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIso,
  DateOnlyIso,
  type QuoteDetail,
  QuoteStatus,
  QuoteUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectQuoteDetail } from '../projections.js';

// v1 deliberately exposes only low-risk commercial-neutral fields. Offering, pricing, line items, and
// assemblies stay in the UI form. `undefined` leaves the current value untouched (get-then-merge).
const UpdateQuoteInput = z.strictObject({
  id: UUID,
  status: QuoteStatus.optional(),
  salesPersonId: AuthId.optional(),
  documentNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  preferredDeliveryDate: DateOnlyIso.nullable().optional(),
  plannedDeliveryDate: DateOnlyIso.nullable().optional(),
  validUntil: DateIso.nullable().optional(),
});

type UpdateQuoteInput = z.infer<typeof UpdateQuoteInput>;

export type UpdateQuoteTool = AiToolBase<'updateQuote', QuoteDetail, UpdateQuoteInput, AiContext>;

export const updateQuoteTool: UpdateQuoteTool = {
  name: 'updateQuote',
  inputSchema: UpdateQuoteInput,
  jsonSchema: toAiToolJsonSchema(UpdateQuoteInput),
  requiredPermission: 'quote:update',
  async handler(args: unknown, ctx: AiContext) {
    const rawInput = UpdateQuoteInput.parse(args);
    const current = await core.getQuote({ db: ctx.db, id: rawInput.id });
    // Reconstruct the current offering: the update schema requires it, but this tool never mutates it.
    const offering =
      current.kind === 'custom'
        ? { kind: 'custom' as const, workTitle: current.workTitle, basePrice: current.quotedBasePrice }
        : { kind: 'product' as const };
    const input = QuoteUpdateInput.parse({
      id: current.id,
      offering,
      salesPersonId: rawInput.salesPersonId ?? current.salesPersonId,
      status: rawInput.status ?? current.status,
      discountPercent: current.discountPercent,
      depositPercent: current.depositPercent,
      deliveryIncluded: current.deliveryIncluded,
      deliveryPrice: current.deliveryPrice,
      validUntil: rawInput.validUntil !== undefined ? rawInput.validUntil : current.validUntil,
      preferredDeliveryDate:
        rawInput.preferredDeliveryDate !== undefined ? rawInput.preferredDeliveryDate : current.preferredDeliveryDate,
      plannedDeliveryDate:
        rawInput.plannedDeliveryDate !== undefined ? rawInput.plannedDeliveryDate : current.plannedDeliveryDate,
      notes: rawInput.notes !== undefined ? rawInput.notes : current.notes,
      documentNotes: rawInput.documentNotes !== undefined ? rawInput.documentNotes : current.documentNotes,
      // lineItems and selectedAssemblies omitted so core leaves them unchanged.
    });

    return core.updateQuote({ actorUserId: requireActorSession(ctx).user.id, db: ctx.db, input });
  },
};

export const updateQuoteDefinition: AiToolDefinition<UpdateQuoteTool> = {
  kind: 'write',
  tool: updateQuoteTool,
  descriptor: {
    purpose:
      'Update low-risk Quote fields (status, salesperson, delivery dates, valid-until, notes), leaving pricing, offering, and line items untouched.',
    useWhen: ['The user explicitly asks to change one of those Quote fields on a specific Quote.'],
    doNotUseWhen: [
      'Editing pricing, offering, line items, or assemblies (that belongs in the Quote form).',
      'The Quote is locked; the change will be rejected.',
    ],
    resultIdentifiers: ['Quote Code', 'status', 'salesperson', 'delivery dates'],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: projectQuoteDetail,
};
