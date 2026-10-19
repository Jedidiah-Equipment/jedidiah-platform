import {
  cancelQuote,
  createQuote,
  generateQuoteDocument,
  getQuote,
  getQuoteCancellationPlan,
  getQuoteProductBayAvailability,
  getQuoteProductOption,
  listAwaitingJobCreationQuotes,
  listCustomers,
  listPriorityQuotes,
  listProductRangeOptions,
  listProducts,
  listQuoteInventoryParts,
  listQuoteSalespeople,
  listQuotes,
  listStaleSentQuotes,
  listUpcomingDeliveryQuotes,
  ProductNotFoundError,
  summarizeQuotePipeline,
  summarizeQuotesByStatus,
  summarizeQuoteWeeklyFlow,
  updateQuote,
} from '@pkg/core/equipment';
import { hasPermission } from '@pkg/domain';
import { renderBrochurePdf, renderQuoteDocumentPdf } from '@pkg/pdf/equipment';
import { UUID } from '@pkg/schema';
import {
  CustomerListInput,
  ProductListInput,
  QuoteCancelInput,
  QuoteCreateInput,
  QuoteDocumentGenerationInput,
  QuoteInventoryPartListInput,
  QuoteInventoryPartListResult,
  QuoteListInput,
  QuotePriorityListInput,
  QuoteProductBayAvailabilityInput,
  QuoteUpdateInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { log } from '@/logger.js';
import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { customerErrorFamily, productUnitErrorFamily, quoteErrorFamily } from '../equipment-error-families.js';

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
    .query(({ ctx, input }) => mapCoreErrors(() => getQuote({ db: ctx.db, id: input.id }), quoteErrorFamily)),

  /** What the cancel dialog is about to touch: the live Job, and the machine that Job is building. */
  cancellationPlan: authorizedProcedure('equipment_quote:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(() => getQuoteCancellationPlan({ db: ctx.db, id: input.id }), quoteErrorFamily),
    ),

  /**
   * Catalog Parts for a Work Item's "Add inventory part" dialog. Gated on quote editing because
   * `sales` holds no part or cost read; the parsed output is what keeps cost and markup server-side.
   */
  inventoryParts: authorizedProcedure('equipment_quote:update')
    .input(QuoteInventoryPartListInput)
    .output(QuoteInventoryPartListResult)
    .query(({ ctx, input }) => listQuoteInventoryParts({ db: ctx.db, input })),

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
    .query(({ ctx, input }) =>
      mapCoreErrors(() => getQuoteProductBayAvailability({ db: ctx.db, input }), quoteErrorFamily),
    ),

  create: authorizedProcedure('equipment_quote:create')
    .input(QuoteCreateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => createQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        quoteErrorFamily,
        productUnitErrorFamily,
        customerErrorFamily,
      ),
    ),

  /**
   * One mutation for both surfaces, gated by the weaker permission and narrowed inside. Cancelling a
   * Quote nobody has acted on is undoing paperwork, which `equipment_quote:update` covers; once it is Locked the
   * cascade unwinds a sale or a build, and core refuses without `equipment_quote:cancel`.
   */
  cancel: authorizedProcedure(['equipment_quote:update', 'equipment_quote:cancel'])
    .input(QuoteCancelInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          cancelQuote({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            mayCancelLockedQuote: hasPermission(ctx.access, 'equipment_quote:cancel'),
            ...input,
          }),
        quoteErrorFamily,
        productUnitErrorFamily,
        customerErrorFamily,
      ),
    ),

  update: authorizedProcedure('equipment_quote:update')
    .input(QuoteUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          updateQuote({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            input,
          }),
        quoteErrorFamily,
        productUnitErrorFamily,
        customerErrorFamily,
      ),
    ),

  generateDocument: authorizedProcedure('equipment_quote:update')
    .input(QuoteDocumentGenerationInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          generateQuoteDocument({
            actorUserId: ctx.session.user.id,
            brochureRenderer: renderBrochurePdf,
            db: ctx.db,
            input,
            pdfRenderer: renderQuoteDocumentPdf,
            storage: ctx.storage,
          }),
        quoteErrorFamily,
      ),
    ),
});
