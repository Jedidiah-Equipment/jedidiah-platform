import type { Db } from '@pkg/db';
import { renderPlainTextEmailHtml } from '@pkg/domain';
import type {
  AuthId,
  BrochurePdfRenderer,
  QuoteDocumentPdfRenderer,
  QuoteDraftEmailInput,
  QuoteDraftEmailResult,
} from '@pkg/schema';

import type { StorageAdapter } from '../documents/storage-adapter.js';
import { persistQuoteDocumentRevision, renderQuoteDocumentRevision } from './quote-document-generation.js';
import { QuoteDraftEmailRecipientMissingError } from './quote-errors.js';
import { getQuote } from './quote-read-service.js';

export type QuoteDraftEmailAttachment = {
  content: Uint8Array;
  contentType?: string;
  filename: string;
};

export type QuoteDraftEmailMessage = {
  attachments: QuoteDraftEmailAttachment[];
  html: string;
  subject: string;
  text: string;
  to: string;
};

export type QuoteDraftEmailSender = (message: QuoteDraftEmailMessage) => Promise<void>;

/**
 * Delivers a customer-style quote email body to the actor's own inbox with a generated Quote Document
 * PDF attached. The email transport is injected so this stays free of API/env concerns.
 */
export async function draftQuoteEmail({
  actorUserId,
  brochureRenderer,
  db,
  emailBody,
  input,
  pdfRenderer,
  recipientEmail,
  sendEmail,
  storage,
}: {
  actorUserId: AuthId;
  brochureRenderer: BrochurePdfRenderer;
  db: Db;
  emailBody: string;
  input: QuoteDraftEmailInput;
  pdfRenderer: QuoteDocumentPdfRenderer;
  recipientEmail: string;
  sendEmail: QuoteDraftEmailSender;
  storage: StorageAdapter;
}): Promise<QuoteDraftEmailResult> {
  const trimmedRecipient = recipientEmail.trim();

  if (!trimmedRecipient) {
    throw new QuoteDraftEmailRecipientMissingError(
      'Your account has no email address, so the draft quote email could not be sent.',
    );
  }

  // Do the failure-prone work first and only persist the Quote Document revision after the email is
  // delivered, so a failed render or send leaves no orphan revision.
  const quote = await getQuote({ db, id: input.quoteId });
  const draft = await renderQuoteDocumentRevision({ brochureRenderer, db, input, pdfRenderer, storage });

  await sendEmail({
    to: trimmedRecipient,
    subject: `Draft quote ${quote.code} — ${quote.customerCompanyName}`,
    text: emailBody,
    html: renderPlainTextEmailHtml(emailBody),
    attachments: [
      {
        content: draft.bytes,
        contentType: 'application/pdf',
        filename: draft.filename,
      },
    ],
  });

  await persistQuoteDocumentRevision({ actorUserId, db, draft, quoteId: input.quoteId, storage });

  return {
    recipientEmail: trimmedRecipient,
    warnings: draft.warnings,
  };
}
