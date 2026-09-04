import {
  cancelQuote,
  createQuote,
  generateQuoteDocument,
  getQuote,
  getQuoteCancellationPlan,
  getQuoteProductBayAvailability,
  getQuoteProductOption,
  isProductUnitCoreError,
  isQuoteCoreError,
  listAwaitingJobCreationQuotes,
  listCustomers,
  listPriorityQuotes,
  listProductRangeOptions,
  listProducts,
  listQuoteSalespeople,
  listQuotes,
  listStaleSentQuotes,
  listUpcomingDeliveryQuotes,
  ProductNotFoundError,
  type ProductUnitCoreError,
  type QuoteCoreError,
  summarizeQuotePipeline,
  summarizeQuotesByStatus,
  summarizeQuoteWeeklyFlow,
  updateQuote,
} from '@pkg/core';
import { hasPermission } from '@pkg/domain';
import { renderBrochurePdf, renderQuoteDocumentPdf } from '@pkg/pdf';
import {
  CustomerListInput,
  ProductListInput,
  QuoteCancelInput,
  QuoteCreateInput,
  QuoteDocumentGenerationInput,
  QuoteListInput,
  QuotePriorityListInput,
  QuoteProductBayAvailabilityInput,
  QuoteUpdateInput,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { log } from '@/logger.js';
import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

export const quotesRouter = router({
  list: authorizedProcedure('equipment_quote:read')
    .input(QuoteListInput)
    .query(({ ctx, input }) => listQuotes({ db: ctx.db, input })),

  priorityList: authorizedProcedure('equipment_quote:read')
    .input(QuotePriorityListInput)
    .query(({ ctx, input }) =>
      listPriorityQuotes({ ...(input.customerId ? { customerId: input.customerId } : {}), db: ctx.db }),
    ),

  awaitingJobCreation: authorizedProcedure('equipment_quote:read').query(({ ctx }) =>
    listAwaitingJobCreationQuotes({ db: ctx.db }),
  ),

  upcomingDeliveries: authorizedProcedure('equipment_quote:read').query(({ ctx }) =>
    listUpcomingDeliveryQuotes({ db: ctx.db }),
  ),

  get: authorizedProcedure('equipment_quote:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuote({ db: ctx.db, id: input.id }))),

  /** What the cancel dialog is about to touch: the live Job, and the machine that Job is building. */
  cancellationPlan: authorizedProcedure('equipment_quote:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuoteCancellationPlan({ db: ctx.db, id: input.id }))),

  salespeople: authorizedProcedure('equipment_quote:read').query(({ ctx }) => listQuoteSalespeople({ db: ctx.db })),

  summaryByStatus: authorizedProcedure('equipment_quote:read').query(({ ctx }) =>
    summarizeQuotesByStatus({ db: ctx.db }),
  ),

  pipelineSummary: authorizedProcedure('equipment_quote:read').query(({ ctx }) =>
    summarizeQuotePipeline({ db: ctx.db }),
  ),

  weeklyFlow: authorizedProcedure('equipment_quote:read').query(({ ctx }) => summarizeQuoteWeeklyFlow({ db: ctx.db })),

  staleSent: authorizedProcedure('equipment_quote:read').query(({ ctx }) => listStaleSentQuotes({ db: ctx.db })),

  customers: authorizedProcedure('equipment_quote:read')
    .input(CustomerListInput)
    .query(({ ctx, input }) => listCustomers({ db: ctx.db, input })),

  products: authorizedProcedure('equipment_quote:read')
    .input(ProductListInput)
    .query(({ ctx, input }) => listProducts({ db: ctx.db, input, log })),

  productOption: authorizedProcedure('equipment_quote:read')
    .input(z.object({ id: UUID }))
    .query(async ({ ctx, input }) => {
      try {
        return await getQuoteProductOption({ db: ctx.db, id: input.id });
      } catch (error) {
        if (error instanceof ProductNotFoundError) {
          return null;
        }

        throw error;
      }
    }),

  rangeOptions: authorizedProcedure('equipment_quote:read').query(({ ctx }) => listProductRangeOptions({ db: ctx.db })),

  productBayAvailability: authorizedProcedure('equipment_quote:read')
    .input(QuoteProductBayAvailabilityInput)
    .query(({ ctx, input }) => mapQuoteErrors(() => getQuoteProductBayAvailability({ db: ctx.db, input }))),

  create: authorizedProcedure('equipment_quote:create')
    .input(QuoteCreateInput)
    .mutation(({ ctx, input }) =>
      mapQuoteMutationErrors(() => createQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input })),
    ),

  /**
   * One mutation for both surfaces, gated by the weaker permission and narrowed inside. Cancelling a
   * Quote nobody has acted on is undoing paperwork, which `equipment_quote:update` covers; once it is Locked the
   * cascade unwinds a sale or a build, and core refuses without `equipment_quote:cancel`.
   */
  cancel: authorizedProcedure(['equipment_quote:update', 'equipment_quote:cancel'])
    .input(QuoteCancelInput)
    .mutation(({ ctx, input }) =>
      mapQuoteMutationErrors(() =>
        cancelQuote({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          mayCancelLockedQuote: hasPermission(ctx.access, 'equipment_quote:cancel'),
          ...input,
        }),
      ),
    ),

  update: authorizedProcedure('equipment_quote:update')
    .input(QuoteUpdateInput)
    .mutation(({ ctx, input }) =>
      mapQuoteMutationErrors(() =>
        updateQuote({
          actorUserId: ctx.session.user.id,
          db: ctx.db,
          input,
        }),
      ),
    ),

  generateDocument: authorizedProcedure('equipment_quote:update')
    .input(QuoteDocumentGenerationInput)
    .mutation(({ ctx, input }) =>
      mapQuoteErrors(() =>
        generateQuoteDocument({
          actorUserId: ctx.session.user.id,
          brochureRenderer: renderBrochurePdf,
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

async function mapQuoteMutationErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapQuoteErrors(() => mapKnownCoreError(action, isProductUnitCoreError, mapProductUnitCoreError));
}

function mapProductUnitCoreError(error: ProductUnitCoreError): CoreErrorMapping<ProductUnitCoreError['code']> {
  if (error.code === 'product_unit.not_found') {
    return { appCode: error.code, code: 'NOT_FOUND', message: 'Product unit not found.' };
  }

  return { appCode: error.code, code: 'BAD_REQUEST', message: error.message };
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
        message: 'Quote includes an invalid Customer, Product, Product Unit, or salesperson.',
      };
    case 'quote.allocation_conflict':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: error.message,
      };
    case 'quote.cancel_denied':
      return {
        appCode: error.code,
        code: 'FORBIDDEN',
        message: error.message,
      };
    case 'quote.offering_invariant':
    case 'quote.already_cancelled':
    case 'quote.cancel_not_an_update':
    case 'quote.custom_selected_assemblies':
    case 'quote.locked':
    case 'quote.document_generation_not_allowed':
    case 'quote.product_bay_availability_not_applicable':
      return {
        appCode: error.code,
        code: 'BAD_REQUEST',
        message: error.message,
      };
    default:
      return assertNever(error);
  }
}
