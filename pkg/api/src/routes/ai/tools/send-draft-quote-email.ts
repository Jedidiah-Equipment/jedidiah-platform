import * as core from '@pkg/core';
import { renderQuoteDocumentPdf } from '@pkg/pdf';
import { type AiToolBase, QuoteDraftEmailInput, type QuoteDraftEmailResult } from '@pkg/schema';
import { z } from 'zod';

import { emailSender } from '@/email/index.js';
import type { AiContext } from '../ai-context.js';
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
    const session = getActorSession(ctx);

    return core.draftQuoteEmail({
      actorUserId: session.user.id,
      db: ctx.db,
      generateEmailBody: async () => emailBody,
      input,
      pdfRenderer: renderQuoteDocumentPdf,
      recipientEmail: session.user.email,
      sendEmail: (message) =>
        emailSender.send({
          attachments: message.attachments,
          html: message.html,
          subject: message.subject,
          text: message.text,
          to: message.to,
          type: 'quote-draft',
        }),
      storage: ctx.storage,
    });
  },
};

function getActorSession(ctx: AiContext): NonNullable<AiContext['session']> {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session;
}
