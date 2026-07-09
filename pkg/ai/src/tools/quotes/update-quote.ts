import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIso,
  DateOnlyIso,
  type QuoteDetail,
  QuotePatchInput,
  QuoteStatus,
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
// assemblies stay in the UI form. `undefined` leaves the current value untouched. The merge over the
// current row happens under the row lock in `core.patchQuote`, so omitted commercial fields are
// never re-supplied from a stale read and a concurrent pricing edit is never reverted.
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
    const input = QuotePatchInput.parse(rawInput);

    return core.patchQuote({ actorUserId: requireActorSession(ctx).user.id, db: ctx.db, input });
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
