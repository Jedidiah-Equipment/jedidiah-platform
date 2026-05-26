import {
  createSupplier,
  getSupplier,
  isSupplierCoreError,
  listSuppliers,
  type SupplierCoreError,
  updateSupplier,
} from '@pkg/core';
import { SupplierCreateInput, SupplierListInput, SupplierUpdateInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { assertNever, type CoreErrorMapping, mapKnownCoreError } from '../../trpc/errors.js';
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
});

async function mapSupplierErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isSupplierCoreError, mapSupplierCoreError);
}

function mapSupplierCoreError(error: SupplierCoreError): CoreErrorMapping<SupplierCoreError['code']> {
  switch (error.code) {
    case 'supplier.duplicate_name':
      return {
        appCode: error.code,
        code: 'CONFLICT',
        message: 'A supplier with this name already exists.',
      };
    case 'supplier.not_found':
      return {
        appCode: error.code,
        code: 'NOT_FOUND',
        message: 'Supplier not found.',
      };
    default:
      return assertNever(error);
  }
}
