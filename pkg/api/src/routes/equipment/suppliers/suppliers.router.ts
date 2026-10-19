import {
  createSupplier,
  getSupplier,
  getSupplierMergePreview,
  listSuppliers,
  mergeSupplier,
  removeSupplier,
  updateSupplier,
} from '@pkg/core/equipment';
import { UUID } from '@pkg/schema';
import { SupplierCreateInput, SupplierListInput, SupplierMergeInput, SupplierUpdateInput } from '@pkg/schema/equipment';
import { z } from 'zod';

import { mapCoreErrors } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { supplierErrorFamily } from '../equipment-error-families.js';

export const suppliersRouter = router({
  list: authorizedProcedure('equipment_supplier:read')
    .input(SupplierListInput)
    .query(({ ctx, input }) => listSuppliers({ db: ctx.db, input })),

  get: authorizedProcedure('equipment_supplier:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapCoreErrors(() => getSupplier({ db: ctx.db, id: input.id }), supplierErrorFamily)),

  create: authorizedProcedure('equipment_supplier:update')
    .input(SupplierCreateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => createSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id }), supplierErrorFamily),
    ),

  update: authorizedProcedure('equipment_supplier:update')
    .input(SupplierUpdateInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => updateSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id }), supplierErrorFamily),
    ),

  mergePreview: authorizedProcedure('equipment_supplier:merge')
    .input(z.object({ sourceId: UUID }))
    .query(({ ctx, input }) =>
      mapCoreErrors(() => getSupplierMergePreview({ db: ctx.db, sourceId: input.sourceId }), supplierErrorFamily),
    ),

  merge: authorizedProcedure('equipment_supplier:merge')
    .input(SupplierMergeInput)
    .mutation(({ ctx, input }) =>
      mapCoreErrors(() => mergeSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id }), supplierErrorFamily),
    ),

  remove: authorizedProcedure('equipment_supplier:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapCoreErrors(
        () => removeSupplier({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id }),
        supplierErrorFamily,
      ),
    ),
});
