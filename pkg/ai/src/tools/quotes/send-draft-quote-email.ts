import { type AiToolBase, QuoteDraftEmailInput, type QuoteDraftEmailResult } from '@pkg/schema';
import { z } from 'zod';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';

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
    doNotUseWhen: [
      'You have not yet inspected the Quote details or written the emailBody; use getQuote first, then compose the body yourself.',
      'The user asks to email the Customer directly; this tool only sends the draft to the signed-in user.',
      'The user only needs Quote details; use getQuote.',
    ],
    searchableIdentifiers: ['Quote UUID', 'leadTime', 'emailBody'],
    resultIdentifiers: ['recipientEmail', 'Quote Document generation warnings'],
  },
  projectResult: identityProjection,
};
