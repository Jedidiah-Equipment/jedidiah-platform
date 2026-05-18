import {
  acceptQuote,
  createQuote,
  getQuote,
  isQuoteCoreError,
  listCustomers,
  listProducts,
  listQuoteSalespeople,
  listQuotes,
  type QuoteCoreError,
  rejectQuote,
  sendQuote,
  updateQuote,
} from '@pkg/core';
import {
  CustomerListInput,
  ProductListInput,
  QuoteCreateInput,
  QuoteDecisionInput,
  QuoteListInput,
  QuoteSendInput,
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

  salespeople: authorizedProcedure('quote:read').query(({ ctx }) => listQuoteSalespeople({ db: ctx.db })),

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

  send: authorizedProcedure('quote:update')
    .input(QuoteSendInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() => sendQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  accept: authorizedProcedure('quote:update')
    .input(QuoteDecisionInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() => acceptQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  reject: authorizedProcedure('quote:update')
    .input(QuoteDecisionInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() => rejectQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
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
    case 'quote.transition_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: 'Quote cannot move to that state.',
      };
    case 'quote.frozen':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: 'Sent quotes cannot be edited.',
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
    default:
      return assertNever(error);
  }
}
