import * as core from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import { EmailAddress } from '@pkg/schema';
import { z } from 'zod';

import type { AiV2Context, AiV2EmailAttachment } from '@/v2/context.js';
import { GeneratedDocumentAttachment } from '@/v2/generated-document.js';

const SendEmailRecipient = z.discriminatedUnion('type', [
  z.object({ type: z.literal('me') }).strict(),
  z.object({ email: EmailAddress, type: z.literal('email') }).strict(),
]);

export type SendEmailInput = z.infer<typeof SendEmailInput>;
export const SendEmailInput = z
  .object({
    attachments: z.array(GeneratedDocumentAttachment).default([]),
    body: z.string().trim().min(1, 'Email body is required'),
    subject: z.string().trim().min(1, 'Email subject is required'),
    to: SendEmailRecipient,
  })
  .strict();

export type SendEmailResponse = z.infer<typeof SendEmailResponse>;
export const SendEmailResponse = z.object({
  attachmentFilenames: z.array(z.string()),
  subject: z.string(),
  to: EmailAddress,
});

export const sendEmailDefinition = {
  name: 'sendEmail',
  description: [
    'Send an email only when the user explicitly asks to send or email it now.',
    'Write the complete subject and body yourself before calling this tool; this tool never invokes another model.',
    'Use { type: "me" } when the user says “send me”. Use an explicit email address only when the user identified that recipient or it came from trusted tool data.',
    'Attachments must be copied unchanged from generateQuoteDocument or generateProductBrochureDocument results.',
    'Do not call for requests that only ask to draft, write, or preview an email in chat.',
  ].join('\n'),
  inputSchema: SendEmailInput,
  outputSchema: SendEmailResponse,
  anyOfPermissions: ['email:send'],
  async handler(args: unknown, ctx: AiV2Context): Promise<SendEmailResponse> {
    const input = SendEmailInput.parse(args);
    const to = resolveRecipient(input.to, ctx);
    const attachments: AiV2EmailAttachment[] = [];

    for (const attachment of input.attachments) {
      attachments.push(await resolveAttachment(attachment, ctx));
    }

    await ctx.sendEmail({ attachments, body: input.body, subject: input.subject, to });

    return SendEmailResponse.parse({
      attachmentFilenames: attachments.map((attachment) => attachment.filename),
      subject: input.subject,
      to,
    });
  },
} as const;

function resolveRecipient(recipient: z.infer<typeof SendEmailRecipient>, ctx: AiV2Context): string {
  if (recipient.type === 'email') {
    return recipient.email;
  }

  if (!ctx.session) {
    throw new Error('A signed-in user is required to send email to yourself.');
  }

  return EmailAddress.parse(ctx.session.user.email);
}

async function resolveAttachment(
  attachment: z.infer<typeof GeneratedDocumentAttachment>,
  ctx: AiV2Context,
): Promise<AiV2EmailAttachment> {
  switch (attachment.type) {
    case 'quoteDocument': {
      if (!hasPermission(ctx.access, 'quote:read')) {
        throw new Error('You do not have permission to attach Quote Documents.');
      }

      const result = await core.readQuoteDocument({
        db: ctx.db,
        documentId: attachment.documentId,
        quoteId: attachment.quoteId,
        storage: ctx.storage,
      });

      return {
        content: await readBytes(result.object.body),
        contentType: result.document.contentType,
        filename: result.document.filename,
      };
    }
    case 'productBrochureDocument': {
      if (!hasPermission(ctx.access, 'product:read') && !hasPermission(ctx.access, 'quote:create')) {
        throw new Error('You do not have permission to attach Product Brochures.');
      }

      const brochure = await core.renderProductBrochurePreview({
        db: ctx.db,
        pdfRenderer: ctx.brochureRenderer,
        productId: attachment.productId,
        storage: ctx.storage,
      });

      return {
        content: brochure.bytes,
        contentType: 'application/pdf',
        filename: brochure.filename,
      };
    }
  }
}

async function readBytes(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for await (const chunk of body) {
    chunks.push(chunk);
    byteLength += chunk.byteLength;
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
