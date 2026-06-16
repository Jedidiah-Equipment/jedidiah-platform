import {
  createQuote,
  draftQuoteEmail,
  generateQuoteDocument,
  getQuote,
  getQuoteProductBayAvailability,
  getQuoteProductBrochure,
  isQuoteCoreError,
  listCustomers,
  listPriorityQuotes,
  listProducts,
  listQuoteSalespeople,
  listQuotes,
  listStaleSentQuotes,
  listUpcomingDeliveryQuotes,
  type QuoteCoreError,
  summarizeQuotePipeline,
  summarizeQuotesByStatus,
  summarizeQuoteWeeklyFlow,
  updateQuote,
} from '@pkg/core';
import { renderQuoteDocumentPdf } from '@pkg/pdf';
import {
  CustomerListInput,
  ProductListInput,
  QuoteCreateInput,
  QuoteDocumentGenerationInput,
  QuoteDraftEmailInput,
  QuoteListInput,
  QuoteProductBayAvailabilityInput,
  QuoteUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emailSender } from '@/email/index.js';
import { log } from '@/logger.js';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';
import { generateQuoteEmailBody } from '../ai/actions/quote-email-body.js';

export const quotesRouter = router({
  list: authorizedProcedure('quote:read')
    .input(QuoteListInput)
    .query(({ ctx, input }) => listQuotes({ db: ctx.db, input })),

  priorityList: authorizedProcedure('quote:read').query(({ ctx }) => listPriorityQuotes({ db: ctx.db })),

  upcomingDeliveries: authorizedProcedure('quote:read').query(({ ctx }) => listUpcomingDeliveryQuotes({ db: ctx.db })),

  get: authorizedProcedure('quote:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuote({ db: ctx.db, id: input.id }))),

  getProductBrochure: authorizedProcedure('quote:read')
    .input(z.object({ quoteId: UUID }))
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuoteProductBrochure({ db: ctx.db, quoteId: input.quoteId }))),

  salespeople: authorizedProcedure('quote:read').query(({ ctx }) => listQuoteSalespeople({ db: ctx.db })),

  summaryByStatus: authorizedProcedure('quote:read').query(({ ctx }) => summarizeQuotesByStatus({ db: ctx.db })),

  pipelineSummary: authorizedProcedure('quote:read').query(({ ctx }) => summarizeQuotePipeline({ db: ctx.db })),

  weeklyFlow: authorizedProcedure('quote:read').query(({ ctx }) => summarizeQuoteWeeklyFlow({ db: ctx.db })),

  staleSent: authorizedProcedure('quote:read').query(({ ctx }) => listStaleSentQuotes({ db: ctx.db })),

  customers: authorizedProcedure('quote:read')
    .input(CustomerListInput)
    .query(({ ctx, input }) => listCustomers({ db: ctx.db, input })),

  products: authorizedProcedure('quote:read')
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

  productBayAvailability: authorizedProcedure('quote:read')
    .input(QuoteProductBayAvailabilityInput)
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuoteProductBayAvailability({ db: ctx.db, input }))),

  create: authorizedProcedure('quote:create')
    .input(QuoteCreateInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() => createQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  update: authorizedProcedure('quote:update')
    .input(QuoteUpdateInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() => updateQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  generateDocument: authorizedProcedure('quote:update')
    .input(QuoteDocumentGenerationInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() =>
        generateQuoteDocument({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
          pdfRenderer: renderQuoteDocumentPdf,
          storage: ctx.storage,
        }),
      ),
    ),

  draftEmail: authorizedProcedure('quote:update')
    .input(QuoteDraftEmailInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() =>
        draftQuoteEmail({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          generateEmailBody: (quote) =>
            generateQuoteEmailBody({
              aiContext: { access: ctx.access, db: ctx.db, session: ctx.session },
              quote,
            }),
          input,
          pdfRenderer: renderQuoteDocumentPdf,
          recipientEmail: ctx.session.user.email,
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
        }),
      ),
    ),
});

async function mapQuoteErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isQuoteCoreError, mapQuoteCoreError);
}

function mapQuoteCoreError(error: QuoteCoreError): CoreErrorMapping<QuoteCoreError['code']> {
  switch (error.code) {
    case 'quote.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Quote not found.',
      };
    case 'quote.discount_invalid':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Quote discount is invalid.',
      };
    case 'quote.invalid_reference':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: 'Quote includes an invalid customer, product, or salesperson.',
      };
    case 'quote.locked':
    case 'quote.document_generation_not_allowed':
    case 'quote.draft_email_recipient_missing':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}
