import {
  acceptQuote,
  createQuote,
  getQuote,
  listCustomers,
  listProducts,
  listQuoteSalespeople,
  listQuotes,
  QuoteDiscountInvalidError,
  QuoteFrozenError,
  QuoteInvalidReferenceError,
  QuoteNotFoundError,
  QuoteTransitionDeniedError,
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
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { log } from '@/logger.js';

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
  try {
    return await action();
  } catch (error) {
    if (error instanceof QuoteNotFoundError) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Quote not found.',
      });
    }

    if (error instanceof QuoteTransitionDeniedError || error instanceof QuoteFrozenError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
      });
    }

    if (error instanceof QuoteDiscountInvalidError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message,
      });
    }

    if (error instanceof QuoteInvalidReferenceError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message,
      });
    }

    throw error;
  }
}
