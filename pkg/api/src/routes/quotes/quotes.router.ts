import {
  countQuotesByWeek,
  createQuote,
  generateQuoteDocument,
  getQuote,
  getQuoteProductBrochure,
  isQuoteCoreError,
  listCustomers,
  listProducts,
  listQuoteSalespeople,
  listQuotes,
  type QuoteCoreError,
  summarizeQuotesByStatus,
  updateQuote,
} from '@pkg/core';
import { renderQuoteDocumentPdf } from '@pkg/pdf';
import {
  CustomerListInput,
  ProductListInput,
  QuoteCreateInput,
  QuoteDocumentGenerationInput,
  QuoteListInput,
  QuoteUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { log } from '@/logger.js';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const quotesRouter = router({
  list: authorizedProcedure('quote:read')
    .input(QuoteListInput)
    .query(({ ctx, input }) => listQuotes({ db: ctx.db, input })),

  get: authorizedProcedure('quote:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuote({ db: ctx.db, id: input.id }))),

  getProductBrochure: authorizedProcedure('quote:read')
    .input(z.object({ quoteId: UUID }))
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuoteProductBrochure({ db: ctx.db, quoteId: input.quoteId }))),

  salespeople: authorizedProcedure('quote:read').query(({ ctx }) => listQuoteSalespeople({ db: ctx.db })),

  summaryByStatus: authorizedProcedure('quote:read').query(({ ctx }) => summarizeQuotesByStatus({ db: ctx.db })),

  createdByWeek: authorizedProcedure('quote:read').query(({ ctx }) => countQuotesByWeek({ db: ctx.db })),

  customers: authorizedProcedure('quote:read')
    .input(CustomerListInput)
    .query(({ ctx, input }) => listCustomers({ db: ctx.db, input })),

  products: authorizedProcedure('quote:read')
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

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
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}
