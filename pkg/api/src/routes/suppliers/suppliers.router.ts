import {
  createSupplier,
  getSupplier,
  isSupplierCoreError,
  listSuppliers,
  removeSupplier,
  type SupplierCoreError,
  updateSupplier,
} from '@pkg/core';
import { SupplierCreateInput, SupplierListInput, SupplierUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
import { authorizedProcedure, router } from '../../trpc/init.js';

export const suppliersRouter = router({
  list: authorizedProcedure('supplier:read')
    .input(SupplierListInput)
    .query(({ ctx, input }) => listSuppliers({ db: ctx.db, input })),

  get: authorizedProcedure('supplier:read')
    .input(z.object({ id: UUID }))
    .query(({ ctx, input }) => mapSupplierErrors(() => getSupplier({ db: ctx.db, id: input.id }))),

  create: authorizedProcedure('supplier:update')
    .input(SupplierCreateInput)
    .mutation(({ ctx, input }) =>
      mapSupplierErrors(() => createSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  update: authorizedProcedure('supplier:update')
    .input(SupplierUpdateInput)
    .mutation(({ ctx, input }) =>
      mapSupplierErrors(() => updateSupplier({ db: ctx.db, input, actorUserId: ctx.session.user.id })),
    ),

  remove: authorizedProcedure('supplier:remove')
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
} satisfies {
  [TCode in SupplierCoreError['code']]: CoreErrorMapping<TCode>;
};
