import { type AiToolBase, QuoteDraftEmailInput, type QuoteDraftEmailResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../context.js';
import { requireActorSession } from './actor.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type SendDraftQuoteEmailInput = z.infer<typeof SendDraftQuoteEmailInput>;
export const SendDraftQuoteEmailInput = QuoteDraftEmailInput.extend({
  emailBody: z.string().trim().min(1),
}).strict();

export type SendDraftQuoteEmailTool = AiToolBase<
  'sendDraftQuoteEmail',
  QuoteDraftEmailResult,
  SendDraftQuoteEmailInput,
  AiContext
>;

export const sendDraftQuoteEmailTool: SendDraftQuoteEmailTool = {
  name: 'sendDraftQuoteEmail',
  inputSchema: SendDraftQuoteEmailInput,
  jsonSchema: toAiToolJsonSchema(SendDraftQuoteEmailInput),
  requiredPermission: 'quote:update',
  async handler(args: unknown, ctx: AiContext) {
    const { emailBody, ...input } = SendDraftQuoteEmailInput.parse(args);
    const session = requireActorSession(ctx);

    return ctx.deliverQuoteDraftEmail({
      actorUserId: session.user.id,
      db: ctx.db,
      emailBody,
      input,
      recipientEmail: session.user.email,
      storage: ctx.storage,
    });
  },
};
