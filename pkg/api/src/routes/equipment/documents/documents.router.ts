import {
  deleteJobPurchaseOrder,
  deleteProductDocument,
  getProductDocuments,
  getQuoteDocuments,
} from '@pkg/core/equipment';
import {
  DocumentListByProductInput,
  DocumentListByQuoteInput,
  JobDocumentInput,
  ProductDocumentInput,
} from '@pkg/schema/equipment';

import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import {
  documentErrorFamily,
  jobErrorFamily,
  productErrorFamily,
  quoteErrorFamily,
} from '../equipment-error-families.js';

export const documentsRouter = router({
  listByProduct: authorizedProcedure('equipment_product:read')
    .input(DocumentListByProductInput)
    .query(({ ctx, input }) =>
      mapCoreErrors(
        () => getProductDocuments({ db: ctx.db, productId: input.productId }),
        documentErrorFamily,
        jobErrorFamily,
        productErrorFamily,
        quoteErrorFamily,
      ),
    ),
  listByQuote: authorizedProcedure('equipment_quote:read')
    .input(DocumentListByQuoteInput)
    .query(({ ctx, input }) =>
      mapCoreErrors(
        () => getQuoteDocuments({ db: ctx.db, quoteId: input.quoteId }),
        documentErrorFamily,
        jobErrorFamily,
        productErrorFamily,
        quoteErrorFamily,
      ),
    ),
  deleteByProduct: authorizedProcedure('equipment_product:update')
    .input(ProductDocumentInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          deleteProductDocument({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            documentId: input.documentId,
            productId: input.productId,
          }),
        documentErrorFamily,
        jobErrorFamily,
        productErrorFamily,
        quoteErrorFamily,
      ),
    ),
  deleteByJob: authorizedProcedure('equipment_job:update')
    .input(JobDocumentInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () =>
          deleteJobPurchaseOrder({
            actorUserId: ctx.session.user.id,
            db: ctx.db,
            documentId: input.documentId,
            jobId: input.jobId,
          }),
        documentErrorFamily,
        jobErrorFamily,
        productErrorFamily,
        quoteErrorFamily,
      ),
    ),
});
