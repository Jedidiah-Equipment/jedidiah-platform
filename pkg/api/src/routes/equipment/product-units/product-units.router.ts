import {
  getProductUnit,
  listOnHandProductUnitStock,
  listProductUnitFilterOptions,
  listProductUnits,
  listReassignCandidates,
  previewReassignment,
  reassignProductUnitToQuote,
  removeProductUnit,
  transferProductUnitOwnership,
  updateProductUnit,
} from '@pkg/core/equipment';
import { UUID } from '@pkg/schema';
import {
  ProductUnitListInput,
  ProductUnitReassignInput,
  ProductUnitStockExportInput,
  ProductUnitTransferInput,
  ProductUnitUpdateInput,
} from '@pkg/schema/equipment';
import { z } from 'zod';

import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, fullyAuthorizedProcedure, router } from '../../../trpc/init.js';
import {
  customerErrorFamily,
  productUnitErrorFamily,
  productUnitReassignErrorFamily,
  quoteErrorFamily,
} from '../equipment-error-families.js';

export const productUnitsRouter = router({
  list: authorizedProcedure('equipment_product_unit:read')
    .input(ProductUnitListInput)
    .query(({ ctx, input }) => listProductUnits({ db: ctx.db, input })),

  filterOptions: authorizedProcedure('equipment_product_unit:read').query(({ ctx }) =>
    listProductUnitFilterOptions({ db: ctx.db }),
  ),

  /**
   * One row of this report crosses four gates at once — the ledger's cost, the Unit, the Product's
   * base price and the sourcing Quote's Customer and Invoice Number — so it demands all four rather
   * than any of them. An any-of gate would hand Sales, which reads Units and Quotes but no costs, a
   * spreadsheet of what the yard cost us. Gated whole rather than field by field, like
   * `jobs.salesExport`: a caller who cannot read cost would be downloading a valuation with its point
   * cut out of it.
   */
  stockExport: fullyAuthorizedProcedure([
    'equipment_inventory_cost:read',
    'equipment_product:read',
    'equipment_product_unit:read',
    'equipment_quote:read',
  ])
    .input(ProductUnitStockExportInput)
    .query(({ ctx, input }) => listOnHandProductUnitStock({ db: ctx.db, input })),

  get: authorizedProcedure('equipment_product_unit:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(() => getProductUnit({ db: ctx.db, id: input.id }), productUnitErrorFamily),
    ),

  update: authorizedProcedure('equipment_product_unit:update')
    .input(ProductUnitUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => updateProductUnit({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        productUnitErrorFamily,
      ),
    ),

  transfer: authorizedProcedure('equipment_product_unit:transfer')
    .input(ProductUnitTransferInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => transferProductUnitOwnership({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        productUnitErrorFamily,
        customerErrorFamily,
      ),
    ),

  /**
   * The receiving deal is the subject of all three, so they are gated on the reassignment permission
   * alone: an operator who may move a machine onto a Quote may read what is movable onto it.
   */
  reassignCandidates: authorizedProcedure('equipment_product_unit:reassign')
    .input(z.object({ quoteId: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(
        () => listReassignCandidates({ db: ctx.db, quoteId: input.quoteId }),
        productUnitErrorFamily,
        productUnitReassignErrorFamily,
        quoteErrorFamily,
      ),
    ),

  reassignPreview: authorizedProcedure('equipment_product_unit:reassign')
    .input(z.object({ productUnitId: UUID, quoteId: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(
        () => previewReassignment({ db: ctx.db, productUnitId: input.productUnitId, quoteId: input.quoteId }),
        productUnitErrorFamily,
        productUnitReassignErrorFamily,
        quoteErrorFamily,
      ),
    ),

  reassign: authorizedProcedure('equipment_product_unit:reassign')
    .input(ProductUnitReassignInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => reassignProductUnitToQuote({ actorUserId: ctx.session.user.id, db: ctx.db, input }),
        productUnitErrorFamily,
        productUnitReassignErrorFamily,
        quoteErrorFamily,
      ),
    ),

  remove: authorizedProcedure('equipment_product_unit:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => removeProductUnit({ actorUserId: ctx.session.user.id, db: ctx.db, id: input.id }),
        productUnitErrorFamily,
      ),
    ),
});
