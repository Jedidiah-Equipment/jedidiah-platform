import {
  createSupplier,
  getSupplier,
  getSupplierMergePreview,
  isSupplierCoreError,
  listSuppliers,
  mergeSupplier,
  removeSupplier,
  type SupplierCoreError,
  updateSupplier,
} from '@pkg/core/equipment';
import { UUID } from '@pkg/schema';
import { SupplierCreateInput, SupplierListInput, SupplierMergeInput, SupplierUpdateInput } from '@pkg/schema/equipment';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../../trpc/errors.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';

export const suppliersRouter = router({
  list: authorizedProcedure('equipment_supplier:read')
    .input(SupplierListInput)
    .query(({ ctx, input }) => listSuppliers({ db: ctx.db, input })),

  get: authorizedProcedure('equipment_supplier:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapSupplierErrors(() => getSupplier({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('equipment_supplier:update')
    .input(SupplierCreateInput)
    .mutation(({ ctx, input }) =>
      mapSupplierErrors(() => createSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('equipment_supplier:update')
    .input(SupplierUpdateInput)
    .mutation(({ ctx, input }) =>
      mapSupplierErrors(() => updateSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  mergePreview: authorizedProcedure('equipment_supplier:merge')
    .input(z.object({ sourceId: UUID }))
    .query(({ ctx, input }) =>
      mapSupplierErrors(() => getSupplierMergePreview({ db: ctx.db, sourceId: input.sourceId })),
    ),

  merge: authorizedProcedure('equipment_supplier:merge')
    .input(SupplierMergeInput)
    .mutation(({ ctx, input }) =>
      mapSupplierErrors(() => mergeSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  remove: authorizedProcedure('equipment_supplier:remove')
    .input(z.object({ id: UUID }))
    .mutation(({ ctx, input }) =>
      mapSupplierErrors(() => removeSupplier({ db: ctx.db, id: input.id, actorUserId: ctx.session.user.id })),
    ),
});

async function mapSupplierErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isSupplierCoreError, mapSupplierCoreError);
}

function mapSupplierCoreError(error: SupplierCoreError): CoreErrorMapping<SupplierCoreError['code']> {
  return supplierErrorMappings[error.code];
}

const supplierErrorMappings = {
  'supplier.duplicate_name': {
    appCode: 'supplier.duplicate_name',
    code: 'CONFLICT',
    message: 'A supplier with this name already exists.',
  },
  'supplier.not_found': {
    appCode: 'supplier.not_found',
    code: 'NOT_FOUND',
    message: 'Supplier not found.',
  },
  'supplier.merge_self': {
    appCode: 'supplier.merge_self',
    code: 'BAD_REQUEST',
    message: 'A supplier cannot be merged into itself.',
  },
  'supplier.has_draft_purchase_orders': {
    appCode: 'supplier.has_draft_purchase_orders',
    code: 'CONFLICT',
    message: 'This supplier cannot be removed while it has Purchase Orders that have not been sent.',
  },
} satisfies {
  [TCode in SupplierCoreError['code']]: CoreErrorMapping<TCode>;
};
