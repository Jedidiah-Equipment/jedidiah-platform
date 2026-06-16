import type { Db } from '@pkg/db';
import type {
  AuthId,
  QuoteDetail,
  QuoteDocumentPdfRenderer,
  QuoteDraftEmailInput,
  QuoteDraftEmailResult,
} from '@pkg/schema';

import { collectStoredObjectBytes } from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { readQuoteDocument } from './quote-document.js';
import { generateQuoteDocument } from './quote-document-generation.js';
import { QuoteDraftEmailRecipientMissingError } from './quote-errors.js';
import { getQuote } from './quote-service.js';

export type QuoteDraftEmailBodyGenerator = (quote: QuoteDetail) => Promise<string>;

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
 * Drafts a customer-style quote email and delivers it to the actor's own inbox: generates the email
 * body with the injected generator, generates the Quote Document PDF (saving it as a new revision),
 * and sends the body with that PDF attached. The OpenAI and email transports are injected so this
 * stays free of API/env concerns.
 */
export async function draftQuoteEmail({
  actorUserId,
  db,
  generateEmailBody,
  input,
  pdfRenderer,
  recipientEmail,
  sendEmail,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  generateEmailBody: QuoteDraftEmailBodyGenerator;
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

  const generation = await generateQuoteDocument({ actorUserId, db, input, pdfRenderer, storage });
  const { document, object } = await readQuoteDocument({
    db,
    documentId: generation.document.id,
    quoteId: input.quoteId,
    storage,
  });
  const pdfBytes = await collectStoredObjectBytes(object);

  const quote = await getQuote({ db, id: input.quoteId });
  const body = await generateEmailBody(quote);

  await sendEmail({
    to: trimmedRecipient,
    subject: `Draft quote ${quote.code} — ${quote.customerCompanyName}`,
    text: body,
    html: renderEmailBodyHtml(body),
    attachments: [
      {
        content: pdfBytes,
        contentType: 'application/pdf',
        filename: document.filename,
      },
    ],
  });

  return {
    recipientEmail: trimmedRecipient,
    warnings: generation.warnings,
  };
}

function renderEmailBodyHtml(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
