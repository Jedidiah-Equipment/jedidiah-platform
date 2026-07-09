import { type AiToolBase, QuoteDraftEmailInput, type QuoteDraftEmailResult } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';

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

export const sendDraftQuoteEmailDefinition: AiToolDefinition<SendDraftQuoteEmailTool> = {
  kind: 'write',
  tool: sendDraftQuoteEmailTool,
  descriptor: {
    purpose: 'Send a completed draft Quote email body with generated Quote PDF to the signed-in user.',
    useWhen: [
      'The user explicitly asks to send or generate a draft email for a known Quote, and you have already written the complete emailBody from Quote details.',
    ],
    doNotUseWhen: ['You have not yet written the complete emailBody; use getQuote first.'],
    resultIdentifiers: ['recipientEmail', 'Quote Document generation warnings'],
  },
  projectResult: identityProjection,
};
